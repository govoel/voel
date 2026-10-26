import { Effect, Schema } from 'effect';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlSchema from 'effect/sql/SqlSchema';

import { MainDatabase } from '#src/database/main/index.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';

class AccountFixture extends Schema.Struct({
  ...Account.upsert.fields,
  active: Schema.BooleanFromBit,
}) {}

/** Seed a row directly, including inactive accounts that application writes never create. */
export const insertAccountFixture = Effect.fnUntraced(function* (
  account: Omit<typeof AccountFixture.Type, 'authStorage'>
) {
  const sql = yield* MainDatabase;
  return yield* SqlSchema.findOne({
    Request: AccountFixture,
    Result: AccountKey,
    execute: (row) => sql`
      insert into
        account ${sql.insert(row)}
      returning
        "serverUrl",
        "userId"
    `,
  })({ ...account, authStorage: {} });
});
