import { Kysely, Migrator } from 'kysely';

import { mainDb } from '~/db/client';
import { ExpoMigrationProvider } from '~/db/driver';
import { MainDatabase } from '~/db/schema/main';

export const mainDbMigrator = new Migrator({
  db: mainDb,
  provider: new ExpoMigrationProvider({
    migrations: {
      '1': {
        up: async (db: Kysely<MainDatabase>) => {
          await db.transaction().execute(async (trx) => {
            await trx.schema
              .createTable('accounts')
              .addColumn('instanceID', 'integer', (col) =>
                col.primaryKey().autoIncrement().notNull()
              )
              .addColumn('instanceURL', 'text', (col) => col.notNull())
              .addColumn('userID', 'text', (col) => col.notNull())
              .addColumn('username', 'text', (col) => col.notNull())
              .addColumn('email', 'text', (col) => col.notNull())
              .addColumn('name', 'text', (col) => col.notNull())
              .addColumn('image', 'text')
              .ifNotExists()
              .execute();

            return await trx.schema
              .createIndex('accounts_instance_url_user_id_unique')
              .on('accounts')
              .columns(['instanceURL', 'userID'])
              .unique()
              .execute();
          });
        },
      },
    },
  }),
});
