import type { BindParams } from '@tursodatabase/sync-react-native';
import {
  Context,
  Duration,
  Effect,
  Layer,
  Predicate,
  ScopedCache,
  Semaphore,
  Stream,
} from 'effect';
import { Reactivity } from 'effect/reactivity';
import type { SqlConnection } from 'effect/sql';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlClient from 'effect/sql/SqlClient';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlError from 'effect/sql/SqlError';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as Statement from 'effect/sql/Statement';

import { TursoSyncClient as CoreTursoSyncClient, TursoSyncError } from '@repo/effect-turso-sync';
import type { TursoSyncClientOptions } from '@repo/effect-turso-sync';
import { makeSyncOperations } from '@repo/effect-turso-sync/operations';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

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
  /** Creates a scoped Effect SQL client backed by one serialized React Native Turso connection. */
  public static readonly make = Effect.fnUntraced(function* <R = never>({
    authToken,
    onConnect,
    ...options
  }: TursoSyncClientOptions<R>) {
    const { Database } = yield* Effect.promise(
      async () => import('@tursodatabase/sync-react-native')
    );
    const compiler = Statement.makeCompilerSqlite();
    const sync = yield* makeSyncOperations({ authToken });

    const makeConnection = Effect.gen(function* () {
      // Own the handle before bootstrapping, so failed/cancelled connects close it too.
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new Database({
              ...options,
              ...(sync.authToken ? { authToken: sync.authToken } : {}),
            }),
          catch: mapConnectionError,
        }),
        (database) =>
          Effect.ignore(
            Effect.sync(() => {
              database.close();
            })
          )
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

      const prepareCache = yield* ScopedCache.make({
        capacity: 200,
        timeToLive: Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.acquireRelease(
            Effect.try({
              try: () => db.prepare(sql),
              catch: (cause) =>
                SqlError.SqlError.make({
                  reason: classifyTursoError(cause, {
                    message: 'Failed to prepare statement',
                    operation: 'prepare',
                  }),
                }),
            }),
            (statement) => Effect.promise(async () => statement.finalize())
          ),
      });

      const operationSemaphore = yield* Semaphore.make(1);
      const run = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          // SqlSchema and SqlModel encode domain values into driver values before execution.
          // Raw queries are intentionally validated by Turso instead of normalized here.
          // Pass one array because Turso treats a single object argument as named parameters;
          // spreading could therefore misclassify one positional ArrayBuffer.
          Effect.tryPromise({
            try: async () =>
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              statement.all([...params] as BindParams),
            catch: (cause) =>
              SqlError.SqlError.make({
                reason: classifyTursoError(cause, {
                  message: 'Failed to execute statement',
                  operation: 'execute',
                }),
              }),
          })
        ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      const runRaw = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          Effect.tryPromise({
            try: async () => {
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              const bindParams = [...params] as BindParams;
              return statement.columnCount() > 0
                ? statement.all(bindParams)
                : statement.run(bindParams);
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

      const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          Effect.tryPromise({
            try: async () =>
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              statement.allValues([...params] as BindParams),
            catch: (cause) =>
              SqlError.SqlError.make({
                reason: classifyTursoError(cause, {
                  message: 'Failed to execute statement',
                  operation: 'execute',
                }),
              }),
          })
        ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      return {
        db,
        connection: {
          execute(sql, params, transformRows) {
            return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params);
          },
          executeRaw(sql, params) {
            return runRaw(sql, params);
          },
          executeValues(sql, params) {
            return runValues(sql, params);
          },
          executeValuesUnprepared(sql, params) {
            return runValues(sql, params);
          },
          executeUnprepared(sql, params, transformRows) {
            return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params);
          },
          executeStream(_sql, _params) {
            return Stream.die('executeStream not implemented');
          },
        } satisfies SqlConnection.Connection,
      };
    });

    const { connection, db } = yield* makeConnection;
    const { transactionAcquirer, onCommitFailure } = SqlClient.makeSqliteAcquirers({
      connection: Effect.succeed(connection),
      semaphore: yield* Semaphore.make(1),
      isTransaction: () => db.inTransaction,
    });

    const client = yield* SqlClient.make({
      // Hold the lease across asynchronous native execution, including recovery.
      acquirer: transactionAcquirer,
      compiler,
      transactionAcquirer,
      onCommitFailure,
      beginTransaction: 'BEGIN IMMEDIATE',
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      spanAttributes: [[ATTR_DB_SYSTEM_NAME, 'turso']],
    });

    if (onConnect) {
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

  /** Provides one configured client as both Turso Sync and generic SQL services. */
  public static readonly layerNoDeps = <R = never>(config: TursoSyncClientOptions<R>) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoSyncClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    );

  public static readonly layer = <R = never>(config: TursoSyncClientOptions<R>) =>
    this.layerNoDeps(config).pipe(Layer.provide(Reactivity.layer));
}

/**
 * The React Native binding currently reports SQLite details in error messages
 * rather than exposing structured SQLite result codes. Structured causes are
 * still delegated to Effect's classifier for forward compatibility.
 */
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

  if (text.includes('UNIQUE constraint failed')) {
    return SqlError.UniqueViolation.make({
      ...props,
      constraint: uniqueConstraintFromMessage(text),
    });
  }
  if (text.includes('constraint failed')) {
    return SqlError.ConstraintError.make(props);
  }
  if (text.includes('syntax error') || text.includes('Parse error')) {
    return SqlError.SqlSyntaxError.make(props);
  }
  if (text.includes('is locked') || text.includes('database is busy')) {
    return SqlError.LockTimeoutError.make(props);
  }
  if (
    text.includes('failed to open database') ||
    text.includes('unable to open database') ||
    text.includes('Native module not found')
  ) {
    return SqlError.ConnectionError.make(props);
  }

  return SqlError.classifySqliteError(cause, options);
};

const uniqueConstraintFromMessage = (message: string) => {
  const prefix = 'UNIQUE constraint failed:';
  const index = message.indexOf(prefix);
  if (index === -1) {
    return 'unknown';
  }
  const constraint = message.slice(index + prefix.length).trim();
  return constraint.length > 0 ? constraint : 'unknown';
};
