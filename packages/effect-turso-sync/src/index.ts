import { StatementPromise as NativeStatement } from '@tursodatabase/database-common';
import { connect } from '@tursodatabase/sync';
import type { DatabaseOpts } from '@tursodatabase/sync';
import {
  Context,
  Duration,
  Effect,
  Layer,
  Predicate,
  Schema,
  Scope,
  ScopedCache,
  Semaphore,
  Stream,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient, SqlError, Statement } from 'effect/unstable/sql';
import type { SqlConnection } from 'effect/unstable/sql';

export type { DatabaseOpts } from '@tursodatabase/sync';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;
const decodeColumns = Schema.decodeUnknownSync(Schema.Array(Schema.Unknown));
const decodeObjectRows = Schema.decodeUnknownSync(
  Schema.Array(Schema.Record(Schema.String, Schema.Unknown))
);
const decodeValueRows = Schema.decodeUnknownSync(Schema.Array(Schema.Array(Schema.Unknown)));

export class TursoSyncClient extends Context.Service<TursoSyncClient>()(
  '@repo/effect-turso-sync/TursoSyncClient',
  {
    /**
     * Creates a scoped, single-connection Turso embedded replica. Supplying a
     * remote URL bootstraps an empty local database during construction.
     */
    make: Effect.fnUntraced(function* <R = never>(
      options: DatabaseOpts & {
        /** How long SQLite waits when the database is busy. Defaults to 5 seconds. */
        readonly busyTimeout?: Duration.Input | undefined;

        /** Runs once after the physical connection has been established. */
        readonly onConnect?: (connection: {
          readonly exec: (sql: string) => Effect.Effect<void, SqlError.SqlError>;
        }) => Effect.Effect<void, SqlError.SqlError, R>;

        readonly spanAttributes?: Record<string, unknown> | undefined;

        readonly transformResultNames?: ((str: string) => string) | undefined;
        readonly transformQueryNames?: ((str: string) => string) | undefined;

        readonly prepareCacheSize?: number | undefined;
        readonly prepareCacheTTL?: Duration.Input | undefined;
      }
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

      const prepare = async (sql: string) => {
        // `@tursodatabase/sync` currently declares prepare's result as `any`,
        // even though it returns database-common's Promise statement.
        const statement: unknown = await db.prepare(sql);
        if (!(statement instanceof NativeStatement)) {
          throw new TypeError('Turso returned an invalid prepared statement');
        }
        return statement;
      };

      const prepareCache = yield* ScopedCache.make({
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.acquireRelease(
            Effect.tryPromise({
              try: async () => prepare(sql),
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
              const rows: unknown = await statement.all(...params);
              return decodeObjectRows(rows);
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
              const columns: unknown = statement.columns();
              if (decodeColumns(columns).length > 0) {
                statement.raw(false);
                const rows: unknown = await statement.all(...params);
                return decodeObjectRows(rows);
              }
              const result: unknown = await statement.run(...params);
              return result;
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
              const rows: unknown = await statement.all(...params);
              return decodeValueRows(rows);
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
      // transactions.
      const connectionSemaphore = yield* Semaphore.make(1);
      const acquirer = Effect.acquireRelease(
        Effect.as(connectionSemaphore.take(1), connection),
        () => connectionSemaphore.release(1)
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
    }),
  }
) {
  public static readonly layer = <R = never>(config: Parameters<typeof this.make<R>>[0]) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoSyncClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    ).pipe(Layer.provide(Reactivity.layer));
}

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
