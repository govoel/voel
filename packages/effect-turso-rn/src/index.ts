import { connect } from '@tursodatabase/sync-react-native';
import type {
  BindParams,
  DatabaseOpts,
  Statement as NativeStatement,
  Row,
} from '@tursodatabase/sync-react-native';
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

export class TursoClient extends Context.Service<TursoClient>()(
  '@repo/effect-turso-rn/TursoClient',
  {
    /**
     * Creates a scoped Effect SQL client backed by one serialized React Native
     * Turso connection. Both local-only and embedded-replica configurations
     * accepted by `@tursodatabase/sync-react-native` are supported.
     */
    make: Effect.fnUntraced(function* (
      options: DatabaseOpts & {
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
      }
    ) {
      const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
      const defaultTransformRows = options.transformResultNames
        ? Statement.defaultTransforms(options.transformResultNames).array
        : void 0;

      const makeConnection = Effect.gen(function* () {
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
          (database) =>
            Effect.ignore(
              Effect.sync(() => {
                database.close();
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

        const prepareCache = yield* ScopedCache.make({
          capacity: options.prepareCacheSize ?? 200,
          timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
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
              (statement) =>
                Effect.ignore(
                  Effect.tryPromise({
                    try: async () => statement.finalize(),
                    catch: (cause) =>
                      SqlError.SqlError.make({
                        reason: classifyTursoError(cause, {
                          message: 'Failed to finalize statement',
                          operation: 'finalize',
                        }),
                      }),
                  })
                )
            ),
        });

        const operationSemaphore = yield* Semaphore.make(1);

        const runPrepared = (sql: string, params: ReadonlyArray<unknown>) =>
          Effect.flatMap(ScopedCache.get(prepareCache, sql), (statement) =>
            executeRows(statement, params)
          ).pipe(Effect.uninterruptible, Semaphore.withPermit(operationSemaphore));

        return {
          connection: {
            execute(sql, params, transformRows) {
              const rows = runPrepared(sql, params);
              return transformRows
                ? rows.pipe(Effect.map((result) => transformRows(result)))
                : rows;
            },
            executeRaw(sql, params) {
              return runPrepared(sql, params);
            },
            executeValues(sql, params) {
              return Effect.map(runPrepared(sql, params), rowsToValues);
            },
            executeValuesUnprepared(sql, params) {
              return Effect.map(runPrepared(sql, params), rowsToValues);
            },
            executeUnprepared(sql, params, transformRows) {
              const rows = runPrepared(sql, params);
              return transformRows
                ? rows.pipe(Effect.map((result) => transformRows(result)))
                : rows;
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
        beginTransaction: 'BEGIN IMMEDIATE',
        spanAttributes,
        transformRows: defaultTransformRows,
      });

      return Object.assign(client, { config: options });
    }),
  }
) {
  public static readonly layer = (config: Parameters<typeof this.make>[0]) =>
    Layer.effectContext(
      Effect.map(this.make(config), (client) =>
        Context.make(TursoClient, client).pipe(Context.add(SqlClient.SqlClient, client))
      )
    ).pipe(Layer.provide(Reactivity.layer));
}

const executeRows = (statement: NativeStatement, params: ReadonlyArray<unknown>) =>
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
  });

const rowsToValues = (rows: ReadonlyArray<Row>): ReadonlyArray<ReadonlyArray<unknown>> =>
  rows.map((row) => Object.values(row));

/**
 * The React Native binding currently reports SQLite details in error messages
 * rather than exposing structured SQLite result codes. Structured causes are
 * still delegated to Effect's classifier for forward compatibility.
 */
const classifyTursoError = (
  cause: unknown,
  options: { message?: string; operation?: string }
): SqlError.SqlErrorReason => {
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

const uniqueConstraintFromMessage = (message: string): string => {
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
