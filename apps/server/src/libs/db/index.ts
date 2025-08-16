import { SourceTap, SourceTapDialect } from '@voel/source-tap';
import { Database, SQLiteError } from 'bun:sqlite';
import { Data, Effect } from 'effect';
import { CompiledQuery, Kysely, NoResultError } from 'kysely';

import type { DatabaseSchema } from '@/libs/db/schema';

import { env } from '@/env';
import { logger } from '@/logger';

export const bunDb = new Database(env.DATABASE_PATH);

export const sourceTap = new SourceTap<DatabaseSchema>({
  trackTables: new Set([
    'library',
    'contributor',
    'series',
    'book',
    'bookSeries',
    'bookContributor',
    'audiobookChapter',
    'audiobookFile',
    'ebookFile',
    'playbackHistory',
  ]),
});

export const dialect = new SourceTapDialect({
  database: bunDb,
  onCreateConnection: async (connection) => {
    connection.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = ON'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA journal_mode = WAL'));
    connection.executeQuery(CompiledQuery.raw('PRAGMA synchronous = NORMAL'));
  },
});

export const db = new Kysely<DatabaseSchema>({
  dialect,
  plugins: [sourceTap],
  log(event) {
    sourceTap.transactionDetector(event);
    if (logger.isLevelEnabled('debug') && event.level === 'query') {
      logger.debug('dbQuery(%sms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    } else if (event.level === 'error') {
      logger.error('dbError(%sms) => %s', event.queryDurationMillis.toFixed(2), event.query.sql);
    }
  },
});

export const isSQLiteError = (error: unknown): error is SQLiteError => error instanceof SQLiteError;

export class KnownSQLiteError extends Data.TaggedClass('KnownSQLiteError')<{
  /**
   * The SQLite3 extended error code
   *
   * This corresponds to `sqlite3_extended_errcode`.
   *
   * @since v1.0.21
   */
  errno: number;

  /**
   * The name of the SQLite3 error code
   *
   * @example
   * "SQLITE_CONSTRAINT_UNIQUE"
   *
   * @since v1.0.21
   */
  code?: string;

  /**
   * The UTF-8 byte offset of the sqlite3 query that failed, if known
   *
   * This corresponds to `sqlite3_error_offset`.
   *
   * @since v1.0.21
   */
  readonly byteOffset: number;
}> {}

export class QueryError extends Data.TaggedError('QueryError')<{
  message: string;
}> {}
export class NotFoundError extends Data.TaggedError('NotFoundError') {}
export type DatabaseError = QueryError | NotFoundError;

export const toEffect = <O>(query: Promise<O>) =>
  Effect.tryPromise({
    try: () => query,
    catch: (error) => {
      if (error instanceof SQLiteError) {
        return new KnownSQLiteError(error);
      }

      if (error instanceof NoResultError) {
        return new NotFoundError();
      }

      if (error instanceof Error) {
        return new QueryError({ message: error.message });
      }

      return new QueryError({ message: String(error) });
    },
  });
