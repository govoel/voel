import { Kysely, Migrator, sql } from 'kysely';

import { mainDb } from '~/db/client';
import { ExpoMigrationProvider } from '~/db/driver';
import type { MainDatabase } from '~/db/schema/main';

export const mainDbMigrator = new Migrator({
  db: mainDb,
  provider: new ExpoMigrationProvider({
    migrations: {
      '1': {
        up: async (db: Kysely<MainDatabase>) => {
          await db.transaction().execute(async (trx) => {
            await trx.schema
              .createTable('accounts')
              .ifNotExists()
              .addColumn('instanceId', 'integer', (col) =>
                col.primaryKey().autoIncrement().notNull()
              )
              .addColumn('instanceURL', 'text', (col) => col.notNull())
              .addColumn('userId', 'text', (col) => col.notNull())
              .addColumn('username', 'text', (col) => col.notNull())
              .addColumn('email', 'text', (col) => col.notNull())
              .addColumn('name', 'text', (col) => col.notNull())
              .addColumn('image', 'text')
              .addColumn('role', 'text', (col) =>
                col
                  .notNull()
                  .defaultTo('under18')
                  .check(sql`role in ('under18', 'user', 'admin')`)
              )
              .addColumn('updatedAt', 'integer', (col) => col.notNull())
              .modifyEnd(sql`STRICT`)
              .execute();

            await trx.schema
              .createIndex('accounts_instance_url_user_id_unique')
              .on('accounts')
              .columns(['instanceURL', 'userId'])
              .unique()
              .execute();

            // no triggers on purpose, we want the same updatedAt value as server
            await trx.schema
              .createIndex('accounts_updatedAt_index')
              .on('accounts')
              .columns(['updatedAt'])
              .execute();
          });
        },
      },
    },
  }),
});
