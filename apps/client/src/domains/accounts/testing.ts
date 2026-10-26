import { Effect, Schema } from 'effect';

import { MainDatabase } from '#src/database/main/index.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';

class AccountFixture extends Schema.Struct({
  ...Account.upsert.fields,
  active: Schema.BooleanFromBit,
}) {
  public static readonly encodeEffect = Schema.encodeEffect(this);
}

/** Seed a row directly, including inactive accounts that application writes never create. */
export const insertAccountFixture = Effect.fnUntraced(function* (
  account: Omit<typeof AccountFixture.Type, 'authStorage'>
) {
  const sql = yield* MainDatabase;
  const row = yield* AccountFixture.encodeEffect({ ...account, authStorage: {} });
  const rows = yield* sql`
    insert into
      account ${sql.insert(row)}
    returning
      "serverUrl",
      "userId"
  `;
  return yield* Schema.decodeUnknownEffect(AccountKey)(rows[0]);
});
