import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import type { TursoSyncClient } from '@repo/effect-turso-sync';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';
import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

export class MainDatabase extends Context.Service<MainDatabase>()(
  'voel/services/database/main/MainDatabase',
  {
    make: (client: TursoSyncClient['Service']) => Effect.succeed(client),
  }
) {
  public static readonly layerNoDeps = MainDatabaseMigrations.layer.pipe(
    Layer.provideMerge(
      Layer.effectContext(
        Effect.gen(function* () {
          const config = yield* AppConfig;
          const factory = yield* TursoSyncClientFactory;
          const client = yield* factory.make({
            path: config.mainDb.filename,
            onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
          });

          return Context.make(MainDatabase, client).pipe(Context.add(SqlClient.SqlClient, client));
        })
      )
    )
  );

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AppConfig.layer, Reactivity.layer])
  );
}
