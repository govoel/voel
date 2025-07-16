import { type MigrationResultSet } from 'kysely';
import { useEffect, useReducer } from 'react';

import { mainDbMigrator } from '~/lib/db/migrations/main';

type MigrationState =
  | { status: 'pending'; success: false; results: null; error: null }
  | { status: 'success'; success: true; results: MigrationResultSet; error: null }
  | { status: 'error'; success: false; results: null; error: Error };

type MigrationAction =
  | { type: 'migrating' }
  | { type: 'migrated'; results: MigrationResultSet }
  | { type: 'error'; error: Error };

export const useMigrations = () => {
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
    mainDbMigrator.migrateToLatest().then((results) => {
      if (results.error) {
        dispatch({
          type: 'error',
          error: results.error instanceof Error ? results.error : new Error('Unknown error'),
        });
      } else {
        dispatch({ type: 'migrated', results });
      }
    });
  }, []);

  return state;
};
