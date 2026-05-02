import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer } from 'effect';
import { Migrator, SqlClient } from 'effect/unstable/sql';

import { initialTables } from '@repo/auth-api/migrations.ts';

import { ApiConfig } from '#src/services/config.ts';

const runMigrations = Migrator.make({});

export const DatabaseLive = Layer.provideMerge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;
      yield* sql`PRAGMA synchronous = NORMAL`;

      yield* runMigrations({
        loader: Migrator.fromRecord({
          '000001-initialAuthTables': initialTables,
        }),
      });
    })
  ),
  Effect.service(ApiConfig).pipe(
    Effect.map((config) => SqliteClient.layer({ filename: config.db.filename, disableWAL: false })),
    Layer.unwrap
  )
);
