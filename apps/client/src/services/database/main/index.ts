import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';
import type { SqlError } from 'effect/unstable/sql';

import { TursoSyncClient } from '@repo/effect-turso-sync-core';
import type { TursoSyncClientOptions } from '@repo/effect-turso-sync-core';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';

export class MainDatabase extends Context.Service<MainDatabase>()(
  'voel/services/database/main/MainDatabase',
  {
    make: (client: TursoSyncClient['Service']) => Effect.succeed(client),
  }
) {
  public static readonly layerNoDeps = (
    clientLayer: (
      options: TursoSyncClientOptions
    ) => Layer.Layer<TursoSyncClient | SqlClient.SqlClient, SqlError.SqlError>
  ) =>
    MainDatabaseMigrations.layer.pipe(
      Layer.provideMerge(
        Layer.unwrap(
          AppConfig.pipe(
            Effect.map((config) =>
              Layer.effectContext(
                TursoSyncClient.pipe(
                  Effect.map((client) =>
                    Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
                  )
                )
              ).pipe(
                Layer.provide(
                  clientLayer({
                    path: config.mainDb.filename,
                    onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
                  })
                )
              )
            )
          )
        )
      )
    );

  public static readonly layer = (clientLayer: Parameters<typeof this.layerNoDeps>[0]) =>
    this.layerNoDeps(clientLayer).pipe(Layer.provide([AppConfig.layer, Reactivity.layer]));
}
