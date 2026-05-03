import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer } from 'effect';
import { Migrator, SqlClient } from 'effect/unstable/sql';

import { initialTables } from '@repo/auth-api/migrations.ts';

import { ApiConfig } from '#src/services/config.ts';
import { baseTables } from '#src/services/database/migrations/000001-base-tables.ts';

const runMigrations = Migrator.make({});

export const DatabaseLive = Layer.provideMerge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;
      yield* sql`PRAGMA synchronous = NORMAL`;

      yield* runMigrations({
        loader: Migrator.fromRecord({
          '000001_initialAuthTables': initialTables,
          '000002_baseTables': baseTables,
        }),
      }).pipe(
        Effect.tap((results) =>
          results.length === 0
            ? Effect.void
            : Effect.logInfo('Database migrations ran successfully', { results })
        ),
        Effect.tapError((error) => Effect.logError('Database migrations failed', { error }))
      );
    })
  ),
  Effect.service(ApiConfig).pipe(
    Effect.map((config) => SqliteClient.layer({ filename: config.db.filename, disableWAL: false })),
    Layer.unwrap
  )
);
