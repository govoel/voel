import { connect } from '@govoel/turso-database';
import type { SyncRequest } from '@govoel/turso-database';
import {
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Pool,
  Predicate,
  Schema,
  ScopedCache,
  Semaphore,
  Stream,
  String,
  pipe,
} from 'effect';
import { HttpServerError, HttpServerResponse } from 'effect/http';
import type { HttpServerRequest } from 'effect/http';
import { Reactivity } from 'effect/reactivity';
import { SqlClient, SqlError, Statement } from 'effect/sql';
import type { SqlConnection } from 'effect/sql';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

export class TursoConfigError extends Schema.TaggedError<
  TursoConfigError,
  { readonly brand: unique symbol }
>('@repo/effect-turso/TursoConfigError')('TursoConfigError', {
  message: Schema.String,
}) {}

class TursoSyncRequestError extends Schema.TaggedError<
  TursoSyncRequestError,
  { readonly brand: unique symbol }
>('@repo/effect-turso/TursoSyncRequestError')('TursoSyncRequestError', {
  cause: Schema.Defect(),
}) {}

export class TursoClient extends Context.Service<TursoClient>()('@repo/effect-turso/TursoClient', {
  /**
   * Creates a scoped Turso client from the supplied configuration, using a
   * connection pool with WAL (the binding default) and a 5-second busy timeout.
   * Explicit transactions take the write lock for their duration, even when
   * they only read.
   */
  make: Effect.fnUntraced(function* <R2 = never>(options: {
    readonly filename: string;
    readonly readonly?: boolean;
    /**
     * Disables automatic WAL checkpoints and header restarts on every pooled
     * connection. Required when serving Turso Sync requests so retained sync
     * revisions are not discarded.
     */
    readonly disableWalAutoActions?: boolean;
    /**
     * How long SQLite waits when the database is busy. Defaults to 5 seconds.
     * `Duration.infinity` is clamped to SQLite's maximum timeout.
     */
    readonly busyTimeout?: Duration.Input;

    /** Defaults to 1. Must not exceed 1 for `:memory:` databases. */
    readonly minConnections?: number | undefined;
    /** Defaults to 10, or 1 for `:memory:` databases. */
    readonly maxConnections?: number | undefined;
    /** Defaults to 45 minutes. */
    readonly connectionTTL?: Duration.Input | undefined;

    /**
     * Runs once for every physical connection, before it enters the pool.
     * Use this for connection-local settings such as SQLite PRAGMAs.
     */
    readonly onConnect?: (connection: {
      readonly exec: (sql: string) => Effect.Effect<void, SqlError.SqlError>;
    }) => Effect.Effect<void, SqlError.SqlError, R2>;

    readonly spanAttributes?: Record<string, unknown>;

    readonly transformResultNames?: (str: string) => string;
    readonly transformQueryNames?: (str: string) => string;

    readonly prepareCacheSize?: number | undefined;
    readonly prepareCacheTTL?: Duration.Input | undefined;
  }) {
    const isInMemory = options.filename === ':memory:';
    const minConnections = options.minConnections ?? 1;
    const maxConnections = options.maxConnections ?? (isInMemory ? 1 : 10);

    if (isInMemory && (minConnections > 1 || maxConnections > 1)) {
      return yield* TursoConfigError.make({
        message: 'Turso databases using ":memory:" support only one pooled connection',
      });
    }

    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
    const defaultTransformRows =
      options.transformResultNames !== void 0
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
              disableWalAutoActions: options.disableWalAutoActions === true,
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
        (database) => Effect.promise(async () => database.close())
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

      if (options.onConnect !== void 0) {
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

      const prepare = (sql: string) =>
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
        );

      const prepareCache = yield* ScopedCache.makeWith({
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: (exit) =>
          Exit.isSuccess(exit) ? (options.prepareCacheTTL ?? Duration.minutes(10)) : Duration.zero,
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
            }),
        }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

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
            }),
        }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

      const runStream = (sql: string, params: ReadonlyArray<unknown>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* Semaphore.takeScoped(operationSemaphore, 1);
            const statement = yield* ScopedCache.get(prepareCache, sql);
            const useSafeIntegers = yield* SqlClient.SafeIntegers;
            statement.safeIntegers(useSafeIntegers);
            statement.raw(false);

            return Stream.fromAsyncIterable<Record<string, unknown>, SqlError.SqlError>(
              statement.iterate(...params),
              (cause) =>
                SqlError.SqlError.make({
                  reason: classifyTursoError(cause, {
                    message: 'Failed to stream statement',
                    operation: 'executeStream',
                  }),
                })
            );
          })
        );

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
        executeStream(sql, params, transformRows) {
          return transformRows !== void 0
            ? runStream(sql, params).pipe(
                Stream.map((row) => transformRows([row])),
                Stream.flattenIterable
              )
            : runStream(sql, params);
        },
      } satisfies SqlConnection.Connection;
      const isTransaction = () => db.inTransaction;
      const { borrower, transactionAcquirer, onCommitFailure } = SqlClient.makeSqliteAcquirers({
        connection: Effect.succeed(connection),
        semaphore: yield* Semaphore.make(1),
        isTransaction,
      });
      return Object.assign(connection, {
        acquire: transactionAcquirer,
        borrow: borrower,
        onCommitFailure,
        isTransaction,
        handleSyncRequest: (request: SyncRequest) =>
          Effect.tryPromise({
            try: async () => db.handleSyncRequest(request),
            catch: (cause) => TursoSyncRequestError.make({ cause }),
          }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore)),
      });
    });

    const pool = yield* Pool.makeWithTTL({
      acquire: makeConnection,
      min: minConnections,
      max: maxConnections,
      timeToLive: options.connectionTTL ?? Duration.minutes(45),
      timeToLiveStrategy: 'creation',
    });
    const acquirer = Effect.tap(Pool.get(pool), (item) => item.acquire);

    yield* Effect.scoped(acquirer);

    const spanAttributes: ReadonlyArray<readonly [string, unknown]> = [
      ...Object.entries(options.spanAttributes ?? {}),
      [ATTR_DB_SYSTEM_NAME, 'turso'],
    ];

    const client = yield* SqlClient.make({
      driver: 'turso',
      acquirer,
      borrower: (f) => Pool.use(pool, (item) => item.borrow(f)),
      compiler,
      transactionAcquirer: acquirer,
      beginTransaction: options.readonly === true ? 'BEGIN' : 'BEGIN IMMEDIATE',
      // SqlClient erases the extra fields; every acquired connection comes from this pool.
      onCommitFailure: (connection) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const item = connection as Effect.Success<typeof makeConnection>;
        return item.onCommitFailure(item);
      },
      isTransaction: (connection) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const item = connection as Effect.Success<typeof makeConnection>;
        return item.isTransaction();
      },
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      spanAttributes,
      transformRows: defaultTransformRows,
    });

    const syncHandler = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
      if (options.disableWalAutoActions !== true) {
        return yield* TursoConfigError.make({
          message: 'Automatic WAL actions must be disabled before handling Turso Sync requests',
        });
      }

      const nativeRequest = {
        method: request.method,
        path: request.url,
        body: new Uint8Array(yield* request.arrayBuffer),
      };
      const response = yield* Pool.get(pool).pipe(
        Effect.flatMap((item) =>
          item.acquire.pipe(Effect.andThen(item.handleSyncRequest(nativeRequest)))
        ),
        Effect.catchTags({
          TursoSyncRequestError: (cause) =>
            new HttpServerError.HttpServerError({
              reason: new HttpServerError.InternalError({
                cause,
                description: 'Failed to handle Turso Sync request',
                request,
              }),
            }),
        }),
        Effect.scoped
      );

      return HttpServerResponse.stream(Stream.succeed(response.body), {
        status: response.status,
        contentType: response.contentType,
        contentLength: response.body.length,
      });
    });

    return Object.assign(client, { config: options, syncHandler });
  }),
}) {
  public static readonly layer = <R = never>(config: Parameters<typeof this.make<R>>[0]) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    ).pipe(Layer.provide(Reactivity.layer));
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
