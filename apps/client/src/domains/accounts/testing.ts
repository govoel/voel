import { Effect, Schema } from 'effect';

import { MainDatabase } from '#src/database/main/index.ts';
import { AuthEncryption } from '#src/domains/accounts/auth-client/encryption.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';

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
  const encryption = yield* AuthEncryption;
  const authStorage = yield* encryption.encrypt({
    data: {},
    context: yield* AccountKey.encodeContext(account),
  });
  const rows = yield* sql`
    insert into
      account ${sql.insert({ ...row, authStorage })}
    returning
      "serverUrl",
      "userId"
  `;
  return yield* Schema.decodeUnknownEffect(AccountKey)(rows[0]);
});
