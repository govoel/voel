import { Context, Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import { TursoClient } from '@repo/effect-turso';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';

export const MainDatabaseTestLayer = MainDatabaseMigrations.layer.pipe(
  Layer.provideMerge(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const client = yield* TursoClient.make({
        filename: config.mainDb.filename,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      });

      // @ts-expect-error -- @repo/effect-turso and @repo/effect-turso-rn have different config types, but they share SqlClient.SqlClient so this is fine
      return Context.make(MainDatabase, client).pipe(Context.add(SqlClient.SqlClient, client));
    }).pipe(Layer.effectContext)
  )
);
