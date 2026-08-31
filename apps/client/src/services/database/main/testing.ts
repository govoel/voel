import { Context, Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import { TursoSyncClient } from '@repo/effect-turso-sync';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';

export const MainDatabaseTestLayer = MainDatabaseMigrations.layer.pipe(
  Layer.provideMerge(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const client = yield* TursoSyncClient.make({
        path: config.mainDb.filename,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      });

      return Context.make(MainDatabase, client).pipe(Context.add(SqlClient.SqlClient, client));
    }).pipe(Layer.effectContext)
  )
);
