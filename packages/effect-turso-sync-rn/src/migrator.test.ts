/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { SqlClient } from 'effect/sql';

import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { SqliteMigrator } from '#src/migrator.ts';

it.effect('fails migrations with a typed error, rolls back their writes, and permits retry', () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped();
    const sql = yield* TursoSyncClient.make({ path: `${directory}/migrator.db` });
    const migration = sql`
      create table items (id integer primary key)
    `.pipe(Effect.asVoid);
    const failed = yield* SqliteMigrator.run({
      loader: SqliteMigrator.fromRecord({
        '1_create_items': migration.pipe(
          Effect.andThen(sql`
            select
              *
            from
              missing_table
          `),
          Effect.asVoid
        ),
      }),
    }).pipe(Effect.provideService(SqlClient.SqlClient, sql), Effect.result);
    expect(failed).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: '@repo/effect-turso-sync-rn/migrator/MigrationError',
        kind: 'Failed',
        message: 'Migration "1_create_items" failed',
        cause: { _tag: 'SqlError' },
      },
    });
    expect(
      yield* sql`
        select
          *
        from
          effect_sql_migrations
      `
    ).toEqual([]);
    expect(
      yield* sql`
        select
          name
        from
          sqlite_master
        where
          name = 'items'
      `
    ).toEqual([]);

    const loader = SqliteMigrator.fromRecord({ '1_create_items': migration });
    const run = SqliteMigrator.run({ loader }).pipe(
      Effect.provideService(SqlClient.SqlClient, sql)
    );
    expect(yield* run).toEqual([[1, 'create_items']]);
    expect(
      yield* sql`
        select
          *
        from
          items
      `
    ).toEqual([]);
    expect(yield* run).toEqual([]);
    expect(
      yield* sql`
        select
          migration_id,
          name
        from
          effect_sql_migrations
      `
    ).toEqual([{ migration_id: 1, name: 'create_items' }]);
  }).pipe(Effect.provide(Layer.mergeAll(BunFileSystem.layer, Reactivity.layer)))
);
