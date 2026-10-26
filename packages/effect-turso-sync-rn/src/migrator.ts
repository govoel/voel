import { Array, Data, Effect, Layer, Option, Order, Record, String as Str, pipe } from 'effect';
import type { SqlError } from 'effect/sql';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlClient from 'effect/sql/SqlClient';

/**
 * Metro-safe SQLite specialization of Effect's SQL migrator.
 *
 * This follows Effect 4.0.6's `effect/sql/Migrator`, while
 * intentionally omitting its filesystem loader. Metro cannot transform that
 * loader's non-literal dynamic import even when it is unused.
 */

type ResolvedMigration = readonly [
  id: number,
  name: string,
  migration: Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>,
];

// oxlint-disable-next-line effecttsgo/prefer-schema-tagged-error -- Preserve upstream’s Data.TaggedError in this Metro-safe specialization.
class MigrationError extends Data.TaggedError(
  '@repo/effect-turso-sync-rn/migrator/MigrationError'
)<{
  readonly cause?: unknown;
  readonly kind: 'BadState' | 'Failed' | 'Duplicates' | 'Locked';
  readonly message: string;
}> {}

/** Runs numbered SQLite migrations using Effect's migration table and locking semantics. */
const make = Effect.fnUntraced(function* <R = never>({
  loader,
  table = 'effect_sql_migrations',
}: {
  readonly loader: Effect.Effect<ReadonlyArray<ResolvedMigration>, MigrationError, R>;
  readonly table?: string;
}) {
  const sql = yield* SqlClient.SqlClient;

  const ensureMigrationsTable = sql`
      create table if not exists ${sql(table)} (
        migration_id integer primary key not null,
        created_at datetime not null default current_timestamp,
        name varchar(255) not null
      )
    `;

  const insertMigrations = (rows: ReadonlyArray<readonly [id: number, name: string]>) =>
    sql`
      insert into
        ${sql(table)} ${sql.insert(
          Array.map(rows, ([migrationId, name]) => ({ migration_id: migrationId, name }))
        )}
    `.withoutTransform;

  const latestMigration = sql<{
    readonly migration_id: number;
    readonly name: string;
    readonly created_at: Date;
  }>`
      select
        migration_id,
        name,
        created_at
      from
        ${sql(table)}
      order by
        migration_id desc
    `.withoutTransform.pipe(
    Effect.map((rows) =>
      Option.map(
        Option.fromNullishOr(rows[0]),
        ({ created_at: createdAt, migration_id: id, name }) => ({
          id,
          name,
          createdAt,
        })
      )
    )
  );

  const runMigration = ([id, name, migration]: ResolvedMigration) =>
    migration.pipe(
      Effect.catchTag(
        'SqlError',
        (cause) =>
          new MigrationError({
            cause,
            kind: 'Failed',
            message: `Migration "${id}_${name}" failed`,
          })
      ),
      Effect.annotateLogs('migration_id', String(id)),
      Effect.annotateLogs('migration_name', name),
      Effect.withSpan(`Migrator ${id}_${name}`)
    );

  const run = Effect.gen(function* () {
    const [latestMigrationId, current] = yield* Effect.all([
      latestMigration.pipe(
        Effect.map(
          Option.match({
            onNone: () => 0,
            onSome: ({ id }) => id,
          })
        )
      ),
      loader,
    ]);

    if (new Set(Array.map(current, ([id]) => id)).size !== current.length) {
      return yield* new MigrationError({
        kind: 'Duplicates',
        message: "Found duplicate migration id's",
      });
    }

    const required = Array.filter(current, ([id]) => id > latestMigrationId);

    if (required.length > 0) {
      yield* insertMigrations(Array.map(required, ([id, name]) => [id, name])).pipe(
        Effect.catchReason(
          'SqlError',
          'UniqueViolation',
          () => new MigrationError({ kind: 'Locked', message: 'Migrations already running' })
        ),
        Effect.catchReason(
          'SqlError',
          'ConstraintError',
          () => new MigrationError({ kind: 'Locked', message: 'Migrations already running' })
        )
      );
    }

    yield* Effect.forEach(
      required,
      (migration) =>
        Effect.logDebug('Running migration').pipe(Effect.andThen(runMigration(migration))),
      { discard: true }
    );

    yield* latestMigration.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.logDebug('Migrations complete'),
          onSome: ({ id, name }) =>
            Effect.logDebug('Migrations complete').pipe(
              Effect.annotateLogs('latest_migration_id', String(id)),
              Effect.annotateLogs('latest_migration_name', name)
            ),
        })
      )
    );

    return Array.map(required, ([id, name]) => [id, name] as const);
  });

  yield* ensureMigrationsTable;

  return yield* sql
    .withTransaction(run)
    .pipe(
      Effect.catchTag('@repo/effect-turso-sync-rn/migrator/MigrationError', (error) =>
        error.kind === 'Locked' ? Effect.as(Effect.logDebug(error.message), []) : error
      )
    );
});

const migrationOrder = Order.make<ResolvedMigration>(([a], [b]) => Order.Number(a, b));

export const SqliteMigrator = {
  fromRecord: (
    migrations: Readonly<
      Record<string, Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>>
    >
  ) =>
    pipe(
      Record.toEntries(migrations),
      Array.flatMap(([key, migration]): ReadonlyArray<ResolvedMigration> => {
        const separator = pipe(key, Str.indexOf('_'));
        if (
          Option.isNone(separator) ||
          separator.value <= 0 ||
          separator.value === key.length - 1
        ) {
          return [];
        }

        const id = pipe(key, Str.slice(0, separator.value));
        if (!/^\d+$/u.test(id)) {
          return [];
        }

        return [[Number(id), pipe(key, Str.slice(separator.value + 1)), migration]];
      }),
      Array.sort(migrationOrder),
      Effect.succeed
    ),

  run: make,
  layer: <R>(options: Parameters<typeof make<R>>[0]) => Layer.effectDiscard(make(options)),
};
