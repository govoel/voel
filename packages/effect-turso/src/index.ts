import { connect } from '@govoel/turso-database';
import type { SyncRequest } from '@govoel/turso-database';
import {
  Context,
  Duration,
  Effect,
  Layer,
  Pool,
  Predicate,
  Schema,
  ScopedCache,
  Semaphore,
  Stream,
} from 'effect';
import { HttpMethod, HttpServerError, HttpServerResponse } from 'effect/unstable/http';
import type { HttpServerRequest } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { Migrator, SqlClient, SqlError, Statement } from 'effect/unstable/sql';
import type { SqlConnection } from 'effect/unstable/sql';

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
  make: Effect.fnUntraced(function* <R = never>(options: {
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
    }) => Effect.Effect<void, SqlError.SqlError, R>;

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

      const runStream = (sql: string, params: ReadonlyArray<unknown>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              operationSemaphore.take(1),
              () => operationSemaphore.release(1),
              { interruptible: true }
            );
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
          executeStream(sql, params, transformRows) {
            return transformRows
              ? runStream(sql, params).pipe(
                  Stream.map((row) => transformRows([row])),
                  Stream.flattenIterable
                )
              : runStream(sql, params);
          },
        } satisfies SqlConnection.Connection,
        handleSyncRequest: (request: SyncRequest) =>
          Effect.tryPromise({
            try: async () => db.handleSyncRequest(request),
            catch: (cause) => TursoSyncRequestError.make({ cause }),
          }).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore)),
      };
    });

    const pool = yield* Pool.makeWithTTL({
      acquire: makeConnection,
      min: minConnections,
      max: maxConnections,
      timeToLive: options.connectionTTL ?? Duration.minutes(45),
      timeToLiveStrategy: 'creation',
    });
    const acquirer = Pool.get(pool).pipe(Effect.map((item) => item.connection));

    // Make connection failures visible while constructing the client instead
    // of deferring them until its first statement.
    yield* Effect.scoped(acquirer);

    const spanAttributes: ReadonlyArray<readonly [string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, 'turso'],
    ];

    const client = yield* SqlClient.make({
      acquirer,
      compiler,
      transactionAcquirer: acquirer,
      beginTransaction: options.readonly === true ? 'BEGIN' : 'BEGIN IMMEDIATE',
      spanAttributes,
      transformRows: defaultTransformRows,
    });

    const syncHandler = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
      if (options.disableWalAutoActions !== true) {
        return yield* TursoConfigError.make({
          message: 'Automatic WAL actions must be disabled before handling Turso Sync requests',
        });
      }

      const nativeRequest = HttpMethod.hasBody(request.method)
        ? {
            method: request.method,
            path: request.url,
            body: new Uint8Array(yield* request.arrayBuffer),
          }
        : { method: request.method, path: request.url };
      const response = yield* Pool.get(pool).pipe(
        Effect.flatMap((item) => item.handleSyncRequest(nativeRequest)),
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

      if (response.body.length === 0) {
        return HttpServerResponse.empty({
          status: response.status,
          headers: { 'content-type': response.contentType },
        });
      }

      // The native response already exists as one complete Buffer. Exposing it
      // as a one-chunk stream avoids Web Response copying the entire buffer.
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
  fromGlob: Migrator.fromGlob,
  fromRecord: Migrator.fromRecord,
  run: Migrator.make({}),
  layer: <R>(options: Migrator.MigratorOptions<R>) =>
    Layer.effectDiscard(SqliteMigrator.run(options)),
};
