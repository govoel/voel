import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import { AppConfig } from '#src/services/config.ts';
import { TursoSyncClientFactory } from '#src/services/database/factory/index.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';

export class MainDatabase extends Context.Service<MainDatabase>()(
  'voel/services/database/main/MainDatabase',
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig;
      const factory = yield* TursoSyncClientFactory;

      return yield* factory.make({
        path: config.mainDb.filename,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      });
    }),
  }
) {
  public static readonly layerNoDeps = MainDatabaseMigrations.layer.pipe(
    Layer.provideMerge(
      Layer.effectContext(
        this.make.pipe(
          Effect.map((client) =>
            Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
          )
        )
      )
    )
  );

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AppConfig.layer, Reactivity.layer])
  );
}
