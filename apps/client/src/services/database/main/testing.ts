import { Effect, Layer, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { TursoSyncClientFactoryBunLayer } from '#src/services/database/factory/bun.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';

/** Seed a row directly, including inactive accounts that application writes never create. */
export const insertAccountFixture = Effect.fnUntraced(function* (
  account: typeof Account.upsert.Type
) {
  const sql = yield* MainDatabase;
  const row = yield* Schema.encodeEffect(Account.upsert)(account);
  yield* sql`
    insert into
      account ${sql.insert(row)}
  `;
});

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactoryBunLayer])
);
