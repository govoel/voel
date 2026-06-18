// oxlint-disable no-extra-bind

import BunSqliteDatabase from 'bun:sqlite';

import { Array, Cause, Effect, Option } from 'effect';
import { SqlError } from 'effect/unstable/sql';
import { Kysely } from 'kysely';
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

interface EffectExecutor {
  executeRaw: <O>(query: QueryRaw<O>) => Effect.Effect<QueryResult<O>, SqlError.SqlError>;
  execute: <O>(query: Query<O>) => Effect.Effect<O[], SqlError.SqlError>;
  executeTakeFirstOption: <O>(
    query: Query<O>
  ) => Effect.Effect<Option.Option<O>, SqlError.SqlError>;
  executeTakeFirstOrUndefined: <O>(
    query: Query<O>
  ) => Effect.Effect<O | undefined, SqlError.SqlError>;
  executeTakeFirstOrError: <O>(
    query: Query<O>
  ) => Effect.Effect<O, SqlError.SqlError | Cause.NoSuchElementError>;
}

interface EffectTransition<DB>
  extends
    Omit<Transaction<DB>, 'transaction' | 'startTransaction' | 'executeQuery'>,
    EffectExecutor {}

export interface EffectKysely<DB>
  extends Omit<Kysely<DB>, 'transaction' | 'startTransaction' | 'executeQuery'>, EffectExecutor {
  trx: () => Omit<TransactionBuilder<DB>, 'execute'> & {
    execute: <A, E>(f: (trx: EffectTransition<DB>) => Effect.Effect<A, E>) => Effect.Effect<A, E>;
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
  f: (trx: EffectTransition<DB>) => Effect.Effect<A, E>
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
        execute: (<A, E>(f: (trx: EffectTransition<DB>) => Effect.Effect<A, E>) =>
          executeTransaction(kyselyBuilderExecute, f)).bind(builder),
      });
    }).bind(kysely),
  });
};

export const createDatabase = <DB>({
  filename,
  trackTables,
  enableLogging,
}: {
  filename: string;
  trackTables?: Set<keyof DB>;
  enableLogging?: boolean;
}) => {
  const sourceTap = trackTables ? new SourceTap<DB>({ trackTables }) : void 0;
  const kysely = new Kysely<DB>({
    dialect:
      trackTables !== void 0
        ? new SourceTapDialect({ database: new BunSqliteDatabase(filename) })
        : new BunSqliteDialect({ database: new BunSqliteDatabase(filename) }),
    plugins: sourceTap !== void 0 ? [sourceTap] : [],
    ...(enableLogging === true || sourceTap !== void 0
      ? {
          log: (event) => {
            if (enableLogging === true) {
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
            }
            if (sourceTap !== void 0) {
              sourceTap.transactionDetector(event);
            }
          },
        }
      : {}),
  });

  return Effect.acquireRelease(
    Effect.succeed({ db: makeFromKysely(kysely), sourceTap }),
    ({ db }) => Effect.promise(async () => db.destroy())
  );
};

interface Executable<O> extends Compilable<O> {
  execute: () => Promise<O[]>;
}

interface ExecutableRaw<O> extends Executable<O>, QueryExecutorProvider {}

type Query<O> = Executable<O> | RawBuilder<O>;
type QueryRaw<O> = ExecutableRaw<O> | RawBuilder<O>;

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

const toSqlError = (operation: string, cause: unknown) =>
  new SqlError.SqlError({
    reason: new SqlError.UnknownError({
      cause,
      operation,
      ...(cause instanceof Error ? { message: cause.message } : {}),
    }),
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
  <O>(query: QueryRaw<O>) =>
    Effect.tryPromise({
      try: async () => queryAsPromise(client, query),
      catch: (cause) => toSqlError('kysely.executeRaw', cause),
    }).pipe(executeSpan(client, query));

const execute =
  <DB>(client: Kysely<DB>) =>
  <O>(query: Query<O>) =>
    Effect.tryPromise({
      try: async () => {
        if (isRawBuilder(query)) {
          const result = await queryAsPromise(client, query);
          return result.rows;
        }
        const results = await query.execute();
        return results;
      },
      catch: (cause) => toSqlError('kysely.execute', cause),
    }).pipe(executeSpan(client, query));

const executeTakeFirstOption =
  <DB>(client: Kysely<DB>) =>
  <O>(query: Query<O>) =>
    execute(client)(query).pipe(
      Effect.map((result) =>
        Array.isReadonlyArrayNonEmpty(result) ? Option.some(result[0]) : Option.none()
      )
    );

const executeTakeFirstOrUndefined =
  <DB>(client: Kysely<DB>) =>
  <O>(query: Query<O>) =>
    executeTakeFirstOption(client)(query).pipe(
      Effect.map((result) => Option.getOrUndefined(result))
    );

const executeTakeFirstOrError =
  <DB>(client: Kysely<DB>) =>
  <O>(query: Query<O>) =>
    executeTakeFirstOption(client)(query).pipe(
      Effect.flatMap((result) =>
        Effect.mapError(Effect.fromOption(result), () => new Cause.NoSuchElementError())
      )
    );
