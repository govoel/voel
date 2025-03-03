import { ExpoMigrationProvider, OpSqliteDialect } from './driver';
import { Database } from './schema';
import { open } from '@op-engineering/op-sqlite';
import { CompiledQuery, Kysely, MigrationResultSet, Migrator } from 'kysely';
import { useEffect, useReducer } from 'react';

export const opDb = open({ name: 'apricotta.db' });

const dialect = new OpSqliteDialect({
  database: opDb,
  onCreateConnection: async (connection) => {
    connection.executeQuery(CompiledQuery.raw(`PRAGMA foreign_keys = ON`));
    connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
  },
});

export const db = new Kysely<Database>({ dialect });

export const getMigrator = new Migrator({
  db,
  provider: new ExpoMigrationProvider({
    migrations: {
      '1': {
        up: async (db: Kysely<Database>) => {
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
              .execute()
              .catch((e) => {
                console.error('error creating accounts table', e);
                throw e;
              });

            return await trx.schema
              .createIndex('accounts_instance_url_user_id_unique')
              .on('accounts')
              .columns(['instanceURL', 'userID'])
              .unique()
              .execute()
              .catch((e) => {
                throw e;
              });
          });
        },
      },
    },
  }),
});

type MigrationState =
  | { success: false; results: null; error: null }
  | { success: true; results: MigrationResultSet; error: null }
  | { success: false; results: null; error: Error };

type MigrationAction =
  | { type: 'migrating' }
  | { type: 'migrated'; results: MigrationResultSet }
  | { type: 'error'; error: Error };

export const useMigrations = (db: Kysely<Database>) => {
  const migrationReducer = (state: MigrationState, action: MigrationAction): MigrationState => {
    switch (action.type) {
      case 'migrating':
        return { success: false, results: null, error: null };
      case 'migrated':
        return { success: true, results: action.results, error: null };
      case 'error':
        return { success: false, results: null, error: action.error };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(migrationReducer, {
    success: false,
    results: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ type: 'migrating' });
    getMigrator
      .migrateToLatest()
      .then((results) => {
        dispatch({ type: 'migrated', results });
      })
      .catch((error) => {
        dispatch({ type: 'error', error });
      });
  }, []);

  return state;
};
