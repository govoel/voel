import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlClient from 'effect/unstable/sql/SqlClient';

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
        onConnect: (sql) =>
          sql`
            pragma foreign_keys = on
          `.pipe(Effect.asVoid),
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
