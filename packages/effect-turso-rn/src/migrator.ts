import { Array, Data, Effect, Layer, Option, Order, pipe } from 'effect';
import { SqlClient } from 'effect/unstable/sql';
import type { SqlError } from 'effect/unstable/sql';

/**
 * Metro-safe SQLite specialization of Effect's SQL migrator.
 *
 * This follows `.repos/effect/packages/effect/src/unstable/sql/Migrator.ts`, while
 * intentionally omitting its filesystem loader. Metro cannot transform that
 * loader's non-literal dynamic import even when it is unused.
 */

type ResolvedMigration = readonly [
  id: number,
  name: string,
  migration: Effect.Effect<void, SqlError.SqlError, SqlClient.SqlClient>,
];

class MigrationError extends Data.TaggedError('MigrationError')<{
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
    sql`INSERT INTO ${sql(table)} ${sql.insert(
      rows.map(([migrationId, name]) => ({ migration_id: migrationId, name }))
    )}`.withoutTransform;

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
      Effect.catch((cause) =>
        Effect.die(
          new MigrationError({
            cause,
            kind: 'Failed',
            message: `Migration "${id}_${name}" failed`,
          })
        )
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

    if (new Set(current.map(([id]) => id)).size !== current.length) {
      return yield* new MigrationError({
        kind: 'Duplicates',
        message: "Found duplicate migration id's",
      });
    }

    const required = current.filter(([id]) => id > latestMigrationId);

    if (required.length > 0) {
      yield* insertMigrations(required.map(([id, name]) => [id, name])).pipe(
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

    return required.map(([id, name]) => [id, name] as const);
  });

  yield* ensureMigrationsTable;

  return yield* sql
    .withTransaction(run)
    .pipe(
      Effect.catchTag('MigrationError', (error) =>
        error.kind === 'Locked' ? Effect.as(Effect.logDebug(error.message), []) : Effect.fail(error)
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
      Object.entries(migrations),
      Array.flatMap(([key, migration]): ReadonlyArray<ResolvedMigration> => {
        const separator = key.indexOf('_');
        if (separator <= 0 || separator === key.length - 1) {
          return [];
        }

        const id = key.slice(0, separator);
        if (!/^\d+$/u.test(id)) {
          return [];
        }

        return [[Number(id), key.slice(separator + 1), migration]];
      }),
      Array.sort(migrationOrder),
      Effect.succeed
    ),

  run: make,
  layer: <R>(options: Parameters<typeof make<R>>[0]) => Layer.effectDiscard(make(options)),
};
