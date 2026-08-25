import { connect } from '@govoel/turso-database';
import type { Database } from '@govoel/turso-database';
import * as Config from 'effect/Config';
import * as Context from 'effect/Context';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import { identity } from 'effect/Function';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';
import * as Stream from 'effect/Stream';
import * as Reactivity from 'effect/unstable/reactivity/Reactivity';
import * as Client from 'effect/unstable/sql/SqlClient';
import type { Connection } from 'effect/unstable/sql/SqlConnection';
import {
  ConnectionError,
  ConstraintError,
  LockTimeoutError,
  SqlError,
  SqlSyntaxError,
  UniqueViolation,
  classifySqliteError,
} from 'effect/unstable/sql/SqlError';
import type { SqlErrorReason } from 'effect/unstable/sql/SqlError';
import * as Statement from 'effect/unstable/sql/Statement';

const ATTR_DB_SYSTEM_NAME = 'db.system.name';
const MAX_BUSY_TIMEOUT = 2_147_483_647;

/**
 * Runtime type identifier used to mark Turso client values.
 */
export const TypeId: TypeId = '~@repo/effect-turso/TursoClient';

/**
 * Type-level identifier used to mark Turso client values.
 */
export type TypeId = '~@repo/effect-turso/TursoClient';

type TursoDatabase = InstanceType<typeof Database>;
type TursoStatement = Awaited<ReturnType<TursoDatabase['prepare']>>;

/**
 * The result of a write statement, mirroring `node:sqlite` run info.
 */
export interface RunInfo {
  readonly changes: number;
  readonly lastInsertRowid: number;
}

type Row = Record<string, unknown>;

/**
 * Service shape for the Turso SQL client, extending the generic `SqlClient`
 * with the connection configuration. Streaming queries and `updateValues`
 * are not supported.
 */
export interface TursoClientService extends Client.SqlClient {
  readonly [TypeId]: TypeId;
  readonly config: TursoClientConfig;
}

/**
 * Configuration for a Turso client backed by `@govoel/turso-database`,
 * including the database filename, read-only mode, busy timeout behavior,
 * span attributes, and query/result name transforms. The Turso engine always
 * uses WAL journaling; the binding silently ignores journal-mode pragmas.
 */
export interface TursoClientConfig {
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
}

/**
 * Creates a scoped Turso client from the supplied configuration, using a
 * single serialized connection with WAL (the binding default) and a 5-second
 * busy timeout. Explicit transactions take the write lock for their duration,
 * even when they only read.
 */
export const make = (
  options: TursoClientConfig
): Effect.Effect<TursoClientService, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
    const defaultTransformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : void 0;

    const makeConnection = Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const busyTimeoutMillis = Math.min(
        MAX_BUSY_TIMEOUT,
        Math.max(0, Math.round(Duration.toMillis(options.busyTimeout ?? Duration.seconds(5))))
      );
      // The binding's `timeout` option sets the connection busy timeout, the
      // same knob as SQLite's `busy_timeout` pragma.
      const db = yield* Effect.tryPromise({
        try: async () =>
          connect(options.filename, {
            readonly: options.readonly ?? false,
            timeout: busyTimeoutMillis,
          }),
        catch: (cause) => classify(cause, 'Failed to connect to database', 'connect'),
      });
      yield* Scope.addFinalizer(scope, Effect.ignore(Effect.promise(async () => db.close())));

      // The binding's `prepare` returns a `Statement` typed as a Promise but
      // without a `.then` method, so it is awaited inside an async wrapper to
      // hand Effect a genuine Promise.
      const prepareStatement = (sql: string) =>
        Effect.tryPromise({
          try: async () => db.prepare(sql),
          catch: (cause) => classify(cause, 'Failed to prepare statement', 'prepare'),
        });

      const runStatement = (
        statement: TursoStatement,
        params: ReadonlyArray<unknown>
      ): Effect.Effect<ReadonlyArray<Row>, SqlError> =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers);
          return Effect.tryPromise({
            try: async () => {
              statement.safeIntegers(useSafeIntegers);
              if (statement.columns().length > 0) {
                return (await statement.all(...params)) as ReadonlyArray<Row>;
              }
              await statement.run(...params);
              return [];
            },
            catch: (cause) => classify(cause, 'Failed to execute statement', 'execute'),
          });
        });

      const runStatementRaw = (
        statement: TursoStatement,
        params: ReadonlyArray<unknown>
      ): Effect.Effect<ReadonlyArray<Row> | RunInfo, SqlError> =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers);
          return Effect.tryPromise({
            try: async () => {
              statement.safeIntegers(useSafeIntegers);
              if (statement.columns().length > 0) {
                return (await statement.all(...params)) as ReadonlyArray<Row>;
              }
              const info = await statement.run(...params);
              return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
            },
            catch: (cause) => classify(cause, 'Failed to execute statement', 'execute'),
          });
        });

      const runStatementValues = (
        statement: TursoStatement,
        params: ReadonlyArray<unknown>
      ): Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError> =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers);
          return Effect.tryPromise({
            try: async () => {
              statement.safeIntegers(useSafeIntegers);
              statement.raw(true);
              if (statement.columns().length > 0) {
                return (await statement.all(...params)) as ReadonlyArray<ReadonlyArray<unknown>>;
              }
              await statement.run(...params);
              return [];
            },
            catch: (cause) => classify(cause, 'Failed to execute statement', 'execute'),
          });
        });

      const run = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.acquireUseRelease(
          prepareStatement(sql),
          (statement) => runStatement(statement, params),
          (statement) =>
            Effect.sync(() => {
              statement.close();
            })
        );

      const runRaw = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.acquireUseRelease(
          prepareStatement(sql),
          (statement) => runStatementRaw(statement, params),
          (statement) =>
            Effect.sync(() => {
              statement.close();
            })
        );

      const runValues = (sql: string, params: ReadonlyArray<unknown>) =>
        Effect.acquireUseRelease(
          prepareStatement(sql),
          (statement) => runStatementValues(statement, params),
          (statement) =>
            Effect.sync(() => {
              statement.close();
            })
        );

      return identity<Connection>({
        execute(sql, params, transformRows) {
          const effect = run(sql, params);
          return transformRows ? effect.pipe(Effect.map((rows) => transformRows(rows))) : effect;
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
          const effect = run(sql, params);
          return transformRows ? effect.pipe(Effect.map((rows) => transformRows(rows))) : effect;
        },
        executeStream(_sql, _params) {
          return Stream.die('executeStream not implemented');
        },
      });
    });

    const semaphore = yield* Semaphore.make(1);
    const connection = yield* makeConnection;

    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection));
    const transactionAcquirer = Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
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

    const client = yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      beginTransaction: 'BEGIN IMMEDIATE',
      spanAttributes,
      transformRows: defaultTransformRows,
    });

    return TursoClient.of(
      Object.assign(client, {
        [TypeId]: TypeId,
        config: options,
      })
    );
  });

/**
 * Service tag for the Turso client implementation.
 */
export class TursoClient extends Context.Service<TursoClient, TursoClientService>()(
  '@repo/effect-turso/turso-client/TursoClient'
) {
  /**
   * See {@link make}.
   */
  public static readonly make = make;

  public static readonly layer = (
    config: TursoClientConfig
  ): Layer.Layer<TursoClient | Client.SqlClient, SqlError> =>
    Layer.effectContext(
      Effect.map(make(config), (client) =>
        Context.make(TursoClient, client).pipe(Context.add(Client.SqlClient, client))
      )
    ).pipe(Layer.provide(Reactivity.layer));

  public static readonly layerConfig = (
    config: Config.Wrap<TursoClientConfig>
  ): Layer.Layer<TursoClient | Client.SqlClient, Config.ConfigError | SqlError> =>
    Layer.effectContext(
      Config.unwrap(config).pipe(
        Effect.flatMap(make),
        Effect.map((client) =>
          Context.make(TursoClient, client).pipe(Context.add(Client.SqlClient, client))
        )
      )
    ).pipe(Layer.provide(Reactivity.layer));
}

// internal

const classify = (cause: unknown, message: string, operation: string): SqlError =>
  SqlError.make({ reason: classifyTursoError(cause, { message, operation }) });

/**
 * Classifies a `@govoel/turso-database` failure into a `SqlErrorReason`.
 *
 * The current binding surfaces SQLite result codes only inside error message
 * strings (e.g. `"step failed: UNIQUE constraint failed: t.name"`), so the
 * classification is message-based. Causes that carry structured codes are
 * delegated to `classifySqliteError`, keeping the driver compatible with
 * future binding versions that expose proper codes.
 */
const classifyTursoError = (
  cause: unknown,
  options: { message?: string; operation?: string }
): SqlErrorReason => {
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
    return UniqueViolation.make({ ...props, constraint: uniqueConstraintFromMessage(text) });
  }
  if (text.includes('constraint failed') || text.includes('FOREIGN KEY constraint')) {
    return ConstraintError.make(props);
  }
  if (text.includes('syntax error') || text.includes('Parse error')) {
    return SqlSyntaxError.make(props);
  }
  if (text.includes('is locked')) {
    return LockTimeoutError.make(props);
  }
  if (text.includes('failed to open database') || text.includes('unable to open database')) {
    return ConnectionError.make(props);
  }

  return classifySqliteError(cause, options);
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
