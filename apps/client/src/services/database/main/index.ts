import { Context, Effect, Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { SqlClient } from 'effect/unstable/sql';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabaseMigrations } from '#src/services/database/main/migrations.ts';

export class MainDatabase extends Context.Service<MainDatabase>()(
  'voel/services/database/main/MainDatabase',
  {
    make: Effect.fnUntraced(function* ({ filename }: { readonly filename: string }) {
      const { TursoClient } = yield* Effect.promise(async () => import('@repo/effect-turso-rn'));
      return yield* TursoClient.make({
        path: filename,
        onConnect: ({ exec }) => exec('PRAGMA foreign_keys = ON'),
      });
    }),
  }
) {
  public static readonly layerNoDeps = MainDatabaseMigrations.layer.pipe(
    Layer.provideMerge(
      Effect.service(AppConfig).pipe(
        Effect.flatMap((config) => this.make({ filename: config.mainDb.filename })),
        Effect.map((client) =>
          Context.make(this, client).pipe(Context.add(SqlClient.SqlClient, client))
        ),
        Layer.effectContext
      )
    )
  );

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([AppConfig.layer, Reactivity.layer])
  );
}
