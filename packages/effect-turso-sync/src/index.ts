import type { StatementPromise } from '@tursodatabase/database-common';
import { connect } from '@tursodatabase/sync';
import type { DatabaseOpts as NativeDatabaseOpts } from '@tursodatabase/sync';
import {
  Context,
  Duration,
  Effect,
  Layer,
  Predicate,
  Scope,
  ScopedCache,
  Semaphore,
  Stream,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError, Statement } from 'effect/unstable/sql';
import type { SqlConnection } from 'effect/unstable/sql';

import { TursoSyncClient } from '@repo/effect-turso-sync-core';
import type { TursoSyncClientOptions as CoreTursoSyncClientOptions } from '@repo/effect-turso-sync-core';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

export type TursoSyncClientOptions<R = never> = CoreTursoSyncClientOptions<R> &
  Omit<NativeDatabaseOpts, keyof CoreTursoSyncClientOptions<R> | 'remoteWritesExperimental'> & {
    readonly remoteWritesExperimental?: never;
  };

/**
 * Creates a scoped, single-connection Turso embedded replica. Supplying a
 * remote URL bootstraps an empty local database during construction.
 */
export const make = Effect.fnUntraced(function* <R = never>(
  /**
   * Turso Sync options supported by this adapter. Remote writes return a
   * different prepared-statement implementation whose result modes do not match
   * Effect SQL's positional-value contract.
   */
  options: TursoSyncClientOptions<R>
) {
  const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
  const defaultTransformRows = options.transformResultNames
    ? Statement.defaultTransforms(options.transformResultNames).array
    : void 0;

  const db = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => connect(options),
      catch: (cause) =>
        SqlError.SqlError.make({
          reason: classifyTursoError(cause, {
            message: 'Failed to connect to database',
            operation: 'connect',
          }),
        }),
    }),
    (database) => Effect.ignore(Effect.promise(async () => database.close()))
  ).pipe(
    Effect.catchReason('SqlError', 'UnknownError', (error) =>
      SqlError.SqlError.make({
        reason: SqlError.ConnectionError.make({
          cause: error.cause,
          message: error.message,
          operation: error.operation,
        }),
      })
    )
  );

  const busyTimeoutMillis = Math.min(
    MAX_BUSY_TIMEOUT,
    Math.max(0, Math.round(Duration.toMillis(options.busyTimeout ?? Duration.seconds(5))))
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

  if (options.onConnect) {
    yield* options.onConnect({
      exec: (sql: string) =>
        Effect.tryPromise({
          try: async () => db.exec(sql),
          catch: (cause) =>
            SqlError.SqlError.make({
              reason: classifyTursoError(cause, {
                message: 'Failed to initialize database connection',
                operation: 'onConnect',
              }),
            }),
        }).pipe(Effect.asVoid, Effect.uninterruptible),
    });
  }

  const prepareCache = yield* ScopedCache.make({
    capacity: options.prepareCacheSize ?? 200,
    timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
    lookup: (sql: string) =>
      Effect.acquireRelease(
        Effect.tryPromise({
          // Turso declares this as `any`; excluding remote writes makes the
          // database-common promise statement its only implementation.
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          try: async () => db.prepare(sql) as Promise<StatementPromise>,
          catch: (cause) =>
            SqlError.SqlError.make({
              reason: classifyTursoError(cause, {
                message: 'Failed to prepare statement',
                operation: 'prepare',
              }),
            }),
        }),
        (statement) =>
          Effect.ignore(
            Effect.sync(() => {
              statement.close();
            })
          )
      ),
  });

  // Statements are cached and mutate their result mode before execution.
  // Serialize access so concurrent uses cannot leak those modes.
  const operationSemaphore = yield* Semaphore.make(1);
  const run = (sql: string, params: ReadonlyArray<unknown>) =>
    Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
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
      })
    ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

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

  const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
    Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
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
      })
    ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

  const connection = {
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
  } satisfies SqlConnection.Connection;

  // A single physical connection backs both ordinary statements and
  // transactions. Leasing it prevents statements and pulls from entering a
  // transaction's BEGIN..COMMIT window.
  const connectionSemaphore = yield* Semaphore.make(1);
  const acquirer = Effect.acquireRelease(Effect.as(connectionSemaphore.take(1), connection), () =>
    connectionSemaphore.release(1)
  );
  const transactionAcquirer = Effect.uninterruptibleMask(
    Effect.fnUntraced(function* (restore) {
      const scope = yield* Effect.scope;
      yield* Effect.tap(restore(connectionSemaphore.take(1)), () =>
        Scope.addFinalizer(scope, connectionSemaphore.release(1))
      );
      return connection;
    })
  );

  const spanAttributes: ReadonlyArray<readonly [string, unknown]> = [
    ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
    [ATTR_DB_SYSTEM_NAME, 'turso'],
  ];

  const client = yield* SqlClient.make({
    acquirer,
    compiler,
    transactionAcquirer,
    beginTransaction: 'BEGIN IMMEDIATE',
    spanAttributes,
    transformRows: defaultTransformRows,
  });

  return Object.assign(client, { config: options });
});

/** Provides one configured client as both Turso Sync and generic SQL services. */
export const layer = <R = never>(config: TursoSyncClientOptions<R>) =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(TursoSyncClient, client).pipe(Context.add(SqlClient.SqlClient, client))
    )
  ).pipe(Layer.provide(Reactivity.layer));

/** Classifies a native Turso failure into Effect's SQLite error model. */
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
  if (text.includes('failed to open database') || text.includes('unable to open database')) {
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
