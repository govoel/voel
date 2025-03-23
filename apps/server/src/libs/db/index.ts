import { Database, SQLiteError } from 'bun:sqlite';
import { Kysely } from 'kysely';
import { BunSqliteDialect } from 'kysely-bun-sqlite';

import { env } from '@/env';
import { logger } from '@/logger';

export const bunDb = new Database(env.DATABASE_PATH);

export const dialect = new BunSqliteDialect({
  database: bunDb,
});

export const db = new Kysely({
  dialect,
  log(event) {
    if (logger.isLevelEnabled('debug') && event.level === 'query') {
      logger.debug('dbQuery(%dms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    } else if (event.level === 'error') {
      logger.error('dbError(%dms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    }
  },
});

export const isSQLiteError = (error: unknown): error is SQLiteError => error instanceof SQLiteError;
