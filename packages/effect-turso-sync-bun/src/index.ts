import { StatementPromise } from '@tursodatabase/database-common';
import { Database } from '@tursodatabase/sync';
import {
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Schema,
  ScopedCache,
  Semaphore,
  Stream,
  String,
  pipe,
} from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlClient, SqlError, Statement } from 'effect/sql';
import type { SqlConnection } from 'effect/sql';

import { TursoSyncClient as CoreTursoSyncClient, TursoSyncError } from '@repo/effect-turso-sync';
import type { TursoSyncClientOptions } from '@repo/effect-turso-sync';
import { makeSyncOperations } from '@repo/effect-turso-sync/operations';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

const decodeStatement = Schema.decodeUnknownEffect(Schema.instanceOf(StatementPromise));

const prepareError = (cause: unknown) =>
  SqlError.SqlError.make({
    reason: classifyTursoError(cause, {
      message: 'Failed to prepare statement',
      operation: 'prepare',
    }),
  });

const mapConnectionError = (cause: unknown) => {
  const reason = classifyTursoError(cause, {
    message: 'Failed to connect to database',
    operation: 'connect',
  });
  return SqlError.SqlError.make({
    reason:
      reason._tag === 'UnknownError'
        ? SqlError.ConnectionError.make({
            cause: reason.cause,
            message: reason.message,
            operation: reason.operation,
          })
        : reason,
  });
};

export class TursoSyncClient extends CoreTursoSyncClient {
  /**
   * Creates a scoped, single-connection Turso embedded replica. Supplying a
   * remote URL bootstraps an empty local database during construction.
   */
  public static readonly make = Effect.fnUntraced(function* <R2 = never>({
    authToken,
    onConnect,
    ...options
  }: TursoSyncClientOptions<R2>) {
    const compiler = Statement.makeCompilerSqlite();

    const sync = yield* makeSyncOperations({ authToken });
    const db = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          new Database({
            ...options,
            ...(sync.authToken !== void 0 ? { authToken: sync.authToken } : {}),
          }),
        catch: mapConnectionError,
      }),
      (database) => Effect.promise(async () => database.close())
    );
    yield* sync.withSyncOperation(
      Effect.tryPromise({
        try: async () => db.connect(),
        catch: mapConnectionError,
      })
    );

    const busyTimeoutMillis = Math.min(
      MAX_BUSY_TIMEOUT,
      Math.max(0, Math.round(Duration.toMillis(Duration.seconds(5))))
    );
    yield* Effect.tryPromise({
      try: async () => db.exec(`PRAGMA busy_timeout = ${busyTimeoutMillis}`),
      catch: (cause) =>
        SqlError.SqlError.make({
          reason: classifyTursoError(cause, {
            message: 'Failed to configure database',
            operation: 'configure',
          }),
        }),
    });

    const prepare = (sql: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const statement: unknown = await db.prepare(sql);
            return statement;
          },
          catch: prepareError,
        }).pipe(Effect.flatMap(decodeStatement), Effect.catchTag('SchemaError', prepareError)),
        (statement) =>
          Effect.sync(() => {
            statement.close();
          })
      );

    const prepareCache = yield* ScopedCache.makeWith({
      capacity: 200,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.minutes(10) : Duration.zero),
      lookup: prepare,
    });

    const withStatement = <A, E, R>({
      sql,
      unprepared,
      execute,
    }: {
      sql: string;
      unprepared: boolean;
      execute: (statement: Effect.Success<ReturnType<typeof prepare>>) => Effect.Effect<A, E, R>;
    }) =>
      unprepared
        ? Effect.scoped(Effect.flatMap(prepare(sql), execute))
        : Effect.flatMap(ScopedCache.get(prepareCache, sql), execute);

    // Statements are cached and mutate their result mode before execution.
    // Serialize access so concurrent uses cannot leak those modes.
    const operationSemaphore = yield* Semaphore.make(1);
    const run = ({
      sql,
      params,
      unprepared = false,
    }: {
      sql: string;
      params: ReadonlyArray<unknown>;
      unprepared?: boolean;
    }) =>
      withStatement({
        sql,
        unprepared,
        execute: (statement) =>
          Effect.tryPromise({
            try: async () => {
              statement.raw(false);
              return statement.all(...params);
            },
            catch: (cause) =>
              SqlError.SqlError.make({
                reason: classifyTursoError(cause, {
                  message: 'Failed to execute statement',
                  operation: 'execute',
                }),
              }),
          }),
      }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

    const runRaw = (sql: string, params: ReadonlyArray<unknown>) =>
      Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
        Effect.tryPromise({
          try: async () => {
            if (statement.columns().length > 0) {
              statement.raw(false);
              return statement.all(...params);
            }
            return statement.run(...params);
          },
          catch: (cause) =>
            SqlError.SqlError.make({
              reason: classifyTursoError(cause, {
                message: 'Failed to execute statement',
                operation: 'execute',
              }),
            }),
        })
      ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

    const runValues = ({
      sql,
      params,
      unprepared = false,
    }: {
      sql: string;
      params: ReadonlyArray<unknown>;
      unprepared?: boolean;
    }) =>
      withStatement({
        sql,
        unprepared,
        execute: (statement) =>
          Effect.tryPromise({
            try: async () => {
              statement.raw(true);
              return statement.all(...params);
            },
            catch: (cause) =>
              SqlError.SqlError.make({
                reason: classifyTursoError(cause, {
                  message: 'Failed to execute statement',
                  operation: 'execute',
                }),
              }),
          }),
      }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

    const connection = {
      execute(sql, params, transformRows) {
        return transformRows !== void 0
          ? Effect.map(run({ sql, params }), transformRows)
          : run({ sql, params });
      },
      executeRaw(sql, params) {
        return runRaw(sql, params);
      },
      executeValues(sql, params) {
        return runValues({ sql, params });
      },
      executeValuesUnprepared(sql, params) {
        return runValues({ sql, params, unprepared: true });
      },
      executeUnprepared(sql, params, transformRows) {
        return transformRows !== void 0
          ? Effect.map(run({ sql, params, unprepared: true }), transformRows)
          : run({ sql, params, unprepared: true });
      },
      executeStream(_sql, _params) {
        return Stream.die('executeStream not implemented');
      },
    } satisfies SqlConnection.Connection;

    const { acquirer, borrower, transactionAcquirer, onCommitFailure, isTransaction } =
      SqlClient.makeSqliteAcquirers({
        connection: Effect.succeed(connection),
        semaphore: yield* Semaphore.make(1),
        isTransaction: () => db.inTransaction,
      });

    const client = yield* SqlClient.make({
      driver: 'turso-sync-bun',
      acquirer,
      borrower,
      compiler,
      transactionAcquirer,
      onCommitFailure,
      isTransaction,
      beginTransaction: 'BEGIN IMMEDIATE',
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      spanAttributes: [[ATTR_DB_SYSTEM_NAME, 'turso']],
    });

    if (onConnect !== void 0) {
      yield* onConnect(client);
    }

    const pull = sync.withSyncOperation(
      Effect.tryPromise({
        try: async () => db.pull(),
        catch: (cause) => TursoSyncError.make({ cause, operation: 'pull' }),
      })
    );

    return Object.assign(client, { config: options, pull });
  });

  public static readonly layerNoDeps = <R = never>(config: TursoSyncClientOptions<R>) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoSyncClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    );

  public static readonly layer = <R = never>(config: TursoSyncClientOptions<R>) =>
    this.layerNoDeps(config).pipe(Layer.provide(Reactivity.layer));
}

const classifyTursoError = (cause: unknown, options: { message?: string; operation?: string }) => {
  const props = {
    cause,
    message: options.message,
    operation: options.operation,
  };
  let text = '';
  if (Predicate.hasProperty(cause, 'message') && typeof cause.message === 'string') {
    text = cause.message;
  }

  if (pipe(text, String.includes('UNIQUE constraint failed'))) {
    return SqlError.UniqueViolation.make({
      ...props,
      constraint: uniqueConstraintFromMessage(text),
    });
  }
  if (pipe(text, String.includes('constraint failed'))) {
    return SqlError.ConstraintError.make(props);
  }
  if (pipe(text, String.includes('syntax error')) || pipe(text, String.includes('Parse error'))) {
    return SqlError.SqlSyntaxError.make(props);
  }
  if (pipe(text, String.includes('is locked')) || pipe(text, String.includes('database is busy'))) {
    return SqlError.LockTimeoutError.make(props);
  }
  if (
    pipe(text, String.includes('failed to open database')) ||
    pipe(text, String.includes('unable to open database'))
  ) {
    return SqlError.ConnectionError.make(props);
  }

  return SqlError.classifySqliteError(cause, options);
};

const uniqueConstraintFromMessage = (message: string) => {
  const prefix = 'UNIQUE constraint failed:';
  const index = pipe(message, String.indexOf(prefix));
  if (Option.isNone(index)) {
    return 'unknown';
  }
  const constraint = pipe(message, String.slice(index.value + prefix.length), String.trim);
  return constraint.length > 0 ? constraint : 'unknown';
};
