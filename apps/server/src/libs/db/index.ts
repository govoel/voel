import { SolarCore, SolarCoreDialect } from '@apricotta/solar-core';
import { Database, SQLiteError } from 'bun:sqlite';
import { CompiledQuery, Kysely } from 'kysely';

import type { DatabaseSchema } from '@/libs/db/schema';

import { env } from '@/env';
import { logger } from '@/logger';

export const bunDb = new Database(env.DATABASE_PATH);

export const solarCore = new SolarCore<DatabaseSchema>({
  trackTables: new Set([
    'library',
    'author',
    'series',
    'book',
    'bookAuthor',
    'bookSeries',
    'bookContributor',
    'audiobookChapter',
    'audiobookFile',
    'ebookFile',
  ]),
});

export const dialect = new SolarCoreDialect({
  database: bunDb,
  onCreateConnection: async (connection) => {
    connection.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = ON'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
  },
});

export const db = new Kysely<DatabaseSchema>({
  dialect,
  plugins: [solarCore],
  log(event) {
    solarCore.transactionDetector(event);
    if (logger.isLevelEnabled('debug') && event.level === 'query') {
      logger.debug('dbQuery(%dms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    } else if (event.level === 'error') {
      logger.error('dbError(%dms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    }
  },
});

export const isSQLiteError = (error: unknown): error is SQLiteError => error instanceof SQLiteError;
