import { Kysely, MigrationResultSet } from 'kysely';
import { useEffect, useReducer } from 'react';

import { createInstanceDbMigrator } from '~/db/migrations/instance';
import { mainDbMigrator } from '~/db/migrations/main';
import { InstanceDatabase } from '~/db/schema/instance';

type MigrationState =
  | { status: 'pending'; success: false; results: null; error: null }
  | { status: 'success'; success: true; results: MigrationResultSet; error: null }
  | { status: 'error'; success: false; results: null; error: Error };

type MigrationAction =
  | { type: 'migrating' }
  | { type: 'migrated'; results: MigrationResultSet }
  | { type: 'error'; error: Error };

export const useMigrations = (
  opts:
    | {
        type: 'instance';
        db: Kysely<InstanceDatabase>;
      }
    | {
        type: 'main';
        db: undefined;
      }
) => {
  const migrationReducer = (state: MigrationState, action: MigrationAction): MigrationState => {
    switch (action.type) {
      case 'migrating':
        return { status: 'pending', success: false, results: null, error: null };
      case 'migrated':
        return { status: 'success', success: true, results: action.results, error: null };
      case 'error':
        return { status: 'error', success: false, results: null, error: action.error };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(migrationReducer, {
    status: 'pending',
    success: false,
    results: null,
    error: null,
  });

  useEffect(() => {
    dispatch({ type: 'migrating' });
    if (opts.type === 'main') {
      mainDbMigrator
        .migrateToLatest()
        .then((results) => {
          dispatch({ type: 'migrated', results });
        })
        .catch((error) => {
          dispatch({ type: 'error', error });
        });
    } else if (opts.type === 'instance') {
      const instanceDbMigrator = createInstanceDbMigrator(opts.db);
      instanceDbMigrator
        .migrateToLatest()
        .then((results) => {
          dispatch({ type: 'migrated', results });
        })
        .catch((error) => {
          dispatch({ type: 'error', error });
        });
    }
  }, [opts.type, opts.db]);

  return state;
};
