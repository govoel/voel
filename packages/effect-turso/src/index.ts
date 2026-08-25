import { connect } from '@govoel/turso-database';
import type { Database } from '@govoel/turso-database';
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Predicate,
  Scope,
  Semaphore,
  Stream,
} from 'effect';
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

/**
 * The result of a write statement, mirroring `node:sqlite` run info.
 */
export type RunInfo = Awaited<ReturnType<TursoDatabase['run']>>;

type Row = Record<string, unknown>;

type RunResult<Mode extends 'object' | 'array' | 'info'> = Mode extends 'info'
  ? RunInfo
  : Mode extends 'array'
    ? ReadonlyArray<ReadonlyArray<unknown>>
    : ReadonlyArray<Row>;

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
export const make = Effect.fnUntraced(function* (
  options: TursoClientConfig
): Effect.fn.Return<TursoClientService, SqlError, Scope.Scope | Reactivity.Reactivity> {
  const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);
  const defaultTransformRows = options.transformResultNames
    ? Statement.defaultTransforms(options.transformResultNames).array
    : void 0;

  const makeConnection = Effect.gen(function* () {
    // The binding's `timeout` option sets the connection busy timeout, the
    // same knob as SQLite's `busy_timeout` pragma.
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
          SqlError.make({
            reason: classifyTursoError(cause, {
              message: 'Failed to connect to database',
              operation: 'connect',
            }),
          }),
      }),
      (database) => Effect.ignore(Effect.promise(async () => database.close()))
    );

    const prepareStatement = (sql: string) =>
      Effect.tryPromise({
        try: async () => db.prepare(sql),
        catch: (cause) =>
          SqlError.make({
            reason: classifyTursoError(cause, {
              message: 'Failed to prepare statement',
              operation: 'prepare',
            }),
          }),
      });

    const runStatement = (
      statement: Awaited<ReturnType<typeof db.prepare>>,
      params: ReadonlyArray<unknown>,
      mode: 'object' | 'array' | 'info'
    ): Effect.Effect<ReadonlyArray<unknown> | RunInfo, SqlError> =>
      Effect.withFiber((fiber) => {
        const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers);
        return Effect.tryPromise({
          try: async () => {
            statement.safeIntegers(useSafeIntegers);
            if (mode === 'array') {
              statement.raw(true);
            }
            // A prepared non-SELECT statement has no columns and `.all()`
            // still executes it, resolving to `[]`. Only the `info` mode
            // therefore needs to branch on `columns()` to yield
            // `{ changes, lastInsertRowid }`.
            if (mode === 'info' && statement.columns().length === 0) {
              const info = await statement.run(...params);
              return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
            }
            // The driver types `.all()` loosely; treat rows as opaque.
            // oxlint-disable-next-line typescript/no-unsafe-return
            return statement.all(...params);
          },
          catch: (cause) =>
            SqlError.make({
              reason: classifyTursoError(cause, {
                message: 'Failed to execute statement',
                operation: 'execute',
              }),
            }),
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              statement.close();
            })
          )
        );
      });

    const run = <Mode extends 'object' | 'array' | 'info'>(
      sql: string,
      params: ReadonlyArray<unknown>,
      mode: Mode
    ): Effect.Effect<RunResult<Mode>, SqlError> =>
      // The conditional `RunResult` is decided by the caller's `mode`
      // literal, which the implementation cannot observe statically.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      Effect.flatMap(prepareStatement(sql), (statement) =>
        runStatement(statement, params, mode)
      ) as Effect.Effect<RunResult<Mode>, SqlError>;

    return {
      execute(sql, params, transformRows) {
        const effect = run(sql, params, 'object');
        return transformRows ? effect.pipe(Effect.map((rows) => transformRows(rows))) : effect;
      },
      executeRaw(sql, params) {
        return run(sql, params, 'info');
      },
      executeValues(sql, params) {
        return run(sql, params, 'array');
      },
      executeValuesUnprepared(sql, params) {
        return run(sql, params, 'array');
      },
      executeUnprepared(sql, params, transformRows) {
        const effect = run(sql, params, 'object');
        return transformRows ? effect.pipe(Effect.map((rows) => transformRows(rows))) : effect;
      },
      executeStream(_sql, _params) {
        return Stream.die('executeStream not implemented');
      },
    } satisfies Connection;
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
  '@repo/effect-turso/TursoClient'
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
  if (text.includes('constraint failed')) {
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
