import { Effect, Schema } from 'effect';

import { Migrator } from '@repo/effect-kysely';
import type { Kysely, MigrationProvider } from '@repo/effect-kysely';

import * as BaseTables from '#src/services/database/main/migrations/000001-base-tables.ts';

export const createMigrationProvider = (): MigrationProvider => ({
  getMigrations: async () => ({
    '000001-base-tables': BaseTables,
  }),
});

class ClientMigrationError extends Schema.TaggedErrorClass<ClientMigrationError>()(
  'voel/services/database/migrations/ClientMigrationError',
  {}
) {}

export const runDatabaseMigrations = Effect.fnUntraced(function* <DB>({ db }: { db: Kysely<DB> }) {
  const provider = createMigrationProvider();
  const migrator = new Migrator({ db, provider });

  const { error, results } = yield* Effect.promise(async () => migrator.migrateToLatest());

  if (error !== void 0) {
    return yield* new ClientMigrationError();
  }

  return results;
});
