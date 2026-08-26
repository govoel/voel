import { connect } from '@govoel/turso-database';
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
import { Migrator, SqlClient, SqlError, Statement } from 'effect/unstable/sql';
import type { SqlConnection } from 'effect/unstable/sql';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

export class TursoClient extends Context.Service<TursoClient>()('@repo/effect-turso/TursoClient', {
  /**
   * Creates a scoped Turso client from the supplied configuration, using a
   * single serialized connection with WAL (the binding default) and a 5-second
   * busy timeout. Explicit transactions take the write lock for their duration,
   * even when they only read.
   */
  make: Effect.fnUntraced(function* (options: {
    readonly filename: string;
    readonly readonly?: boolean;
    /**
     * How long SQLite waits when the database is busy. Defaults to 5 seconds.
     * `Duration.infinity` is clamped to SQLite's maximum timeout.
     */
    readonly busyTimeout?: Duration.Input;
    readonly spanAttributes?: Record<string, unknown>;

    readonly transformResultNames?: (str: string) => string;
    readonly transformQueryNames?: (str: string) => string;

    readonly prepareCacheSize?: number | undefined;
    readonly prepareCacheTTL?: Duration.Input | undefined;
  }) {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
    const defaultTransformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : void 0;

    const makeConnection = Effect.gen(function* () {
      const busyTimeoutMillis = Math.min(
        MAX_BUSY_TIMEOUT,
        Math.max(0, Math.round(Duration.toMillis(options.busyTimeout ?? Duration.seconds(5))))
      );
      const db = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () =>
            connect(options.filename, {
              readonly: options.readonly ?? false,
              timeout: busyTimeoutMillis,
            }),
          catch: (cause) =>
            SqlError.SqlError.make({
              reason: classifyTursoError(cause, {
                message: 'Failed to connect to database',
                operation: 'connect',
              }),
            }),
        }),
        (database) => Effect.ignore(Effect.promise(async () => database.close()))
      );

      const prepareCache = yield* ScopedCache.make({
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.acquireRelease(
            Effect.tryPromise({
              try: async () => db.prepare(sql),
              catch: (cause) =>
                SqlError.SqlError.make({
                  reason: classifyTursoError(cause, {
                    message: 'Failed to prepare statement',
                    operation: 'prepare',
                  }),
                }),
            }),
            (statement) =>
              Effect.sync(() => {
                statement.close();
              })
          ),
      });

      const operationSemaphore = yield* Semaphore.make(1);
      const run = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          Effect.withFiber((fiber) => {
            const useSafeIntegers = Context.get(fiber.context, SqlClient.SafeIntegers);
            return Effect.tryPromise({
              try: async () => {
                statement.safeIntegers(useSafeIntegers);
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
            });
          })
        ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      const runRaw = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          Effect.withFiber((fiber) => {
            const useSafeIntegers = Context.get(fiber.context, SqlClient.SafeIntegers);
            return Effect.tryPromise({
              try: async () => {
                statement.safeIntegers(useSafeIntegers);
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
            });
          })
        ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
          Effect.withFiber((fiber) => {
            const useSafeIntegers = Context.get(fiber.context, SqlClient.SafeIntegers);
            return Effect.tryPromise({
              try: async () => {
                statement.safeIntegers(useSafeIntegers);
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
            });
          })
        ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      return {
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

    const semaphore = yield* Semaphore.make(1);
    const { connection } = yield* makeConnection;

    const acquirer = Effect.acquireRelease(Effect.as(semaphore.take(1), connection), () =>
      semaphore.release(1)
    );
    const transactionAcquirer = Effect.uninterruptibleMask(
      Effect.fnUntraced(function* (restore) {
        const scope = yield* Effect.scope;
        yield* Effect.tap(restore(semaphore.take(1)), () =>
          Scope.addFinalizer(scope, semaphore.release(1))
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
      beginTransaction: options.readonly === true ? 'BEGIN' : 'BEGIN IMMEDIATE',
      spanAttributes,
      transformRows: defaultTransformRows,
    });

    return Object.assign(client, { config: options });
  }),
}) {
  public static readonly layer = (config: Parameters<typeof this.make>[0]) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    ).pipe(Layer.provide(Reactivity.layer));
}

/**
 * Classifies a `@govoel/turso-database` failure into a `SqlErrorReason`.
 *
 * The current binding surfaces SQLite result codes only inside error message
 * strings (e.g. `"step failed: UNIQUE constraint failed: t.name"`; verified
 * against 0.8.0-pre.7, where every failure carries `code:
 * "GenericFailure"`), so the classification is message-based. Causes that
 * carry structured codes are delegated to `classifySqliteError`, keeping the
 * driver compatible with future binding versions that expose proper codes.
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

export const SqliteMigrator = {
  run: Migrator.make({}),
  layer: <R>(options: Migrator.MigratorOptions<R>) =>
    Layer.effectDiscard(SqliteMigrator.run(options)),
};
