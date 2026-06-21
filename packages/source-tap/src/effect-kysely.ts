// oxlint-disable no-extra-bind

import BunSqliteDatabase from 'bun:sqlite';

import { Array, Effect, Option, Schema } from 'effect';
import type { Scope } from 'effect';
import { Kysely, ParseJSONResultsPlugin } from 'kysely';
import type {
  Compilable,
  QueryExecutorProvider,
  QueryResult,
  RawBuilder,
  Transaction,
  TransactionBuilder,
} from 'kysely';

import { BunSqliteDialect, SourceTapDialect } from '#src/dialect.ts';
import { SourceTap } from '#src/source-tap.ts';

export class DatabaseSqlError extends Schema.TaggedErrorClass<
  DatabaseSqlError,
  { readonly brand: unique symbol }
>()('@repo/source-tap/effect-kysely/DatabaseSqlError', {
  cause: Schema.Unknown,
  message: Schema.optional(Schema.String),
}) {
  public static readonly is = Schema.is(this);
}

export class DatabaseNseError extends Schema.TaggedErrorClass<
  DatabaseNseError,
  { readonly brand: unique symbol }
>()('@repo/source-tap/effect-kysely/DatabaseNseError', {}) {
  public static readonly is = Schema.is(this);
}

interface EffectExecutor {
  executeRaw: <Q extends AnyRawQuery>(
    query: Q
  ) => Effect.Effect<QueryResult<QueryOutput<Q>>, DatabaseSqlError>;
  execute: <Q extends AnyQuery>(query: Q) => Effect.Effect<QueryOutput<Q>[], DatabaseSqlError>;
  executeTakeFirstOption: <Q extends AnyQuery>(
    query: Q
  ) => Effect.Effect<Option.Option<QueryOutput<Q>>, DatabaseSqlError>;
  executeTakeFirstOrUndefined: <Q extends AnyQuery>(
    query: Q
  ) => Effect.Effect<QueryOutput<Q> | undefined, DatabaseSqlError>;
  executeTakeFirstOrError: <Q extends AnyQuery>(
    query: Q
  ) => Effect.Effect<QueryOutput<Q>, DatabaseSqlError | DatabaseNseError>;
}

export interface EffectTransaction<DB>
  extends
    Omit<Transaction<DB>, 'transaction' | 'startTransaction' | 'executeQuery'>,
    EffectExecutor {}

export interface EffectKysely<DB>
  extends Omit<Kysely<DB>, 'transaction' | 'startTransaction' | 'executeQuery'>, EffectExecutor {
  trx: () => Omit<TransactionBuilder<DB>, 'execute'> & {
    execute: <A, E>(f: (trx: EffectTransaction<DB>) => Effect.Effect<A, E>) => Effect.Effect<A, E>;
  };
}

const makeExecutor = <DB>(client: Kysely<DB>): EffectExecutor => ({
  executeRaw: executeRaw(client).bind(client),
  execute: execute(client).bind(client),
  executeTakeFirstOption: executeTakeFirstOption(client).bind(client),
  executeTakeFirstOrUndefined: executeTakeFirstOrUndefined(client).bind(client),
  executeTakeFirstOrError: executeTakeFirstOrError(client).bind(client),
});

const executeTransaction = <DB, A, E>(
  kyselyBuilderExecute: TransactionBuilder<DB>['execute'],
  f: (trx: EffectTransaction<DB>) => Effect.Effect<A, E>
) =>
  Effect.tryPromise({
    try: async () =>
      kyselyBuilderExecute(async (trx) =>
        Effect.runPromise(f(Object.assign(trx, makeExecutor(trx))))
      ),
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    catch: (error) => error as E,
  });

export const makeFromKysely = <DB>(kysely: Kysely<DB>): EffectKysely<DB> => {
  const kyselyTransaction = kysely.transaction.bind(kysely);
  return Object.assign(kysely, {
    ...makeExecutor(kysely),
    trx: (() => {
      const builder = kyselyTransaction();
      const kyselyBuilderExecute = builder.execute.bind(builder);

      return Object.assign(builder, {
        execute: (<A, E>(f: (trx: EffectTransaction<DB>) => Effect.Effect<A, E>) =>
          executeTransaction(kyselyBuilderExecute, f)).bind(builder),
      });
    }).bind(kysely),
  });
};

interface CreateDatabaseOptions<DB> {
  filename: string;
  trackTables?: ReadonlySet<keyof DB>;
  enableLogging?: boolean;
}

interface CreateTrackedDatabaseOptions<DB> extends CreateDatabaseOptions<DB> {
  trackTables: ReadonlySet<keyof DB>;
}

interface CreatedDatabase<DB> {
  db: EffectKysely<DB>;
  sourceTap: SourceTap<DB> | undefined;
  kysely: Kysely<DB>;
}

interface CreatedTrackedDatabase<DB> extends CreatedDatabase<DB> {
  sourceTap: SourceTap<DB>;
}

export function createDatabase<DB>(
  options: CreateTrackedDatabaseOptions<DB>
): Effect.Effect<CreatedTrackedDatabase<DB>, never, Scope.Scope>;
export function createDatabase<DB>(
  options: CreateDatabaseOptions<DB>
): Effect.Effect<CreatedDatabase<DB>, never, Scope.Scope>;
export function createDatabase<DB>({
  filename,
  trackTables,
  enableLogging,
}: CreateDatabaseOptions<DB>) {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const parseJsonResultsPlugin = new ParseJSONResultsPlugin();
      const sourceTap = trackTables ? yield* SourceTap.make<DB>({ trackTables }) : void 0;
      const kysely = new Kysely<DB>({
        dialect:
          trackTables !== void 0
            ? new SourceTapDialect({
                database: new BunSqliteDatabase(filename),
                onBeginTransaction: () => sourceTap?.beginTransaction(),
                onCommitTransaction: () => sourceTap?.commitTransaction(),
                onRollbackTransaction: () => sourceTap?.rollbackTransaction(),
              })
            : new BunSqliteDialect({ database: new BunSqliteDatabase(filename) }),
        plugins:
          sourceTap !== void 0 ? [sourceTap, parseJsonResultsPlugin] : [parseJsonResultsPlugin],
        ...(enableLogging === true
          ? {
              log: (event) => {
                if (event.level === 'query') {
                  // @effect-diagnostics-next-line globalConsole:off
                  // oxlint-disable-next-line eslint/no-console
                  console.log(
                    `${sourceTap ? '☀️' : '🍦'} dbQuery(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
                  );
                } else {
                  // @effect-diagnostics-next-line globalConsole:off
                  // oxlint-disable-next-line eslint/no-console
                  console.log(
                    `${sourceTap ? '☀️' : '🍦'} dbError(${event.queryDurationMillis.toFixed(2)}ms) => ${event.query.sql}`
                  );
                }
              },
            }
          : {}),
      });

      return { db: makeFromKysely(kysely), sourceTap, kysely };
    }),
    ({ db }) => Effect.promise(async () => db.destroy())
  );
}

interface Executable<O> extends Compilable<O> {
  execute: () => Promise<O[]>;
}

interface ExecutableRaw<O> extends Executable<O>, QueryExecutorProvider {}

type Query<O> = Executable<O> | RawBuilder<O>;
type QueryRaw<O> = ExecutableRaw<O> | RawBuilder<O>;
type AnyQuery = Query<unknown>;
type AnyRawQuery = QueryRaw<unknown>;
type QueryOutput<Q> = Q extends RawBuilder<infer O> ? O : Q extends Executable<infer O> ? O : never;

const isRawBuilder = <O>(query: Executable<O> | RawBuilder<O>): query is RawBuilder<O> =>
  `isRawBuilder` in query && query.isRawBuilder;

const queryAsPromise = async <DB, O>(
  client: Kysely<DB>,
  query: QueryRaw<O>
): Promise<QueryResult<O>> => {
  if (isRawBuilder(query)) {
    return query.execute(client);
  }
  const executor = query.getExecutor();
  const compiledQuery = query.compile();
  return executor.executeQuery(compiledQuery);
};

const toSqlError = (cause: unknown) =>
  new DatabaseSqlError({
    cause,
    ...(cause instanceof Error ? { message: cause.message } : {}),
  });

const executeSpan = <DB>(client: Kysely<DB>, query: Query<unknown> | QueryRaw<unknown>) => {
  const compiled = isRawBuilder(query) ? query.compile(client) : query.compile();
  return Effect.withSpan(
    `kysely.execute`,
    {
      kind: 'client',
      attributes: { sql: compiled.sql },
    },
    { captureStackTrace: false }
  );
};

const executeRaw =
  <DB>(client: Kysely<DB>) =>
  <Q extends AnyRawQuery>(query: Q) =>
    Effect.tryPromise({
      // oxlint-disable-next-line no-unsafe-type-assertion
      try: async () => queryAsPromise(client, query) as Promise<QueryResult<QueryOutput<Q>>>,
      catch: (cause) => toSqlError(cause),
    }).pipe(executeSpan(client, query));

const execute =
  <DB>(client: Kysely<DB>) =>
  <Q extends AnyQuery>(query: Q) =>
    Effect.tryPromise({
      try: async () => {
        if (isRawBuilder(query)) {
          const result = await queryAsPromise(client, query);
          // oxlint-disable-next-line no-unsafe-type-assertion
          return result.rows as QueryOutput<Q>[];
        }
        const results = await query.execute();
        // oxlint-disable-next-line no-unsafe-type-assertion
        return results as QueryOutput<Q>[];
      },
      catch: (cause) => toSqlError(cause),
    }).pipe(executeSpan(client, query));

const executeTakeFirstOption =
  <DB>(client: Kysely<DB>) =>
  <Q extends AnyQuery>(query: Q) =>
    execute(client)(query).pipe(
      Effect.map((result) =>
        Array.isReadonlyArrayNonEmpty(result) ? Option.some(result[0]) : Option.none()
      )
    );

const executeTakeFirstOrUndefined =
  <DB>(client: Kysely<DB>) =>
  <Q extends AnyQuery>(query: Q) =>
    executeTakeFirstOption(client)(query).pipe(
      Effect.map((result) => Option.getOrUndefined(result))
    );

const executeTakeFirstOrError =
  <DB>(client: Kysely<DB>) =>
  <Q extends AnyQuery>(query: Q) =>
    executeTakeFirstOption(client)(query).pipe(
      Effect.flatMap((result) =>
        Effect.mapError(Effect.fromOption(result), () => new DatabaseNseError())
      )
    );
