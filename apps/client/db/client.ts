import { open } from '@op-engineering/op-sqlite';
import { CompiledQuery, Kysely } from 'kysely';

import { OpSqliteDialect } from '~/db/driver';
import { InstanceDatabase } from '~/db/schema/instance';
import { MainDatabase } from '~/db/schema/main';

export const mainOpDb = open({ location: 'databases', name: 'main.db' });

const dialect = new OpSqliteDialect({
  database: mainOpDb,
  onCreateConnection: async (connection) => {
    connection.executeQuery(CompiledQuery.raw(`PRAGMA foreign_keys = ON`));
    connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
  },
});

export const mainDb = new Kysely<MainDatabase>({ dialect });

export const createInstanceDb = (instanceId: number) => {
  const instanceOpDb = open({ location: 'databases/instances', name: `${instanceId}.db` });

  const instanceDialect = new OpSqliteDialect({
    database: instanceOpDb,
    onCreateConnection: async (connection) => {
      connection.executeQuery(CompiledQuery.raw(`PRAGMA foreign_keys = ON`));
      connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
      connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
    },
  });

  return { instanceDb: new Kysely<InstanceDatabase>({ dialect: instanceDialect }), instanceOpDb };
};
