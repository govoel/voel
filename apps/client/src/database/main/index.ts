import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { AppConfig } from '#src/config.ts';
import { TursoSyncClientFactory } from '#src/database/factory/index.ts';
import { MainDatabaseMigrations } from '#src/database/main/migrations.ts';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlClient from 'effect/sql/SqlClient';


export class MainDatabase extends Context.Service<MainDatabase>()(
  'voel/database/main/MainDatabase',
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
