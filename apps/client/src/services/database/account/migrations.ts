import { Effect, Schema } from 'effect';

import { Migrator } from '@repo/effect-kysely';
import type { Kysely, MigrationProvider } from '@repo/effect-kysely';

import * as BaseTables from '#src/services/database/account/migrations/000001-base-tables.ts';

const provider: MigrationProvider = {
  getMigrations: async () => ({ '000001-base-tables': BaseTables }),
};

export class AccountDatabaseMigrationError extends Schema.TaggedError<
  AccountDatabaseMigrationError,
  { readonly brand: unique symbol }
>('voel/services/database/account/migrations/AccountDatabaseMigrationError')(
  'AccountDatabaseMigrationError',
  {}
) {}

export const runAccountDatabaseMigrations = Effect.fnUntraced(function* <DB>(db: Kysely<DB>) {
  const { error } = yield* Effect.promise(async () =>
    new Migrator({ db, provider }).migrateToLatest()
  );
  if (error !== void 0) {
    return yield* new AccountDatabaseMigrationError();
  }
  return void 0;
});
