import { Effect, Layer, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { TursoSyncClientFactoryBunLayer } from '#src/services/database/factory/bun.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';

class AccountFixture extends Schema.Struct({
  ...Account.upsert.fields,
  active: Schema.BooleanFromBit,
}) {
  public static readonly encodeEffect = Schema.encodeEffect(this);
}

/** Seed a row directly, including inactive accounts that application writes never create. */
export const insertAccountFixture = Effect.fnUntraced(function* (
  account: typeof AccountFixture.Type
) {
  const sql = yield* MainDatabase;
  const row = yield* AccountFixture.encodeEffect(account);
  yield* sql`
    insert into
      account ${sql.insert(row)}
  `;
});

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactoryBunLayer])
);
