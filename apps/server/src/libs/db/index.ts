import { Database } from 'bun:sqlite';
import { Kysely } from 'kysely';
import { BunSqliteDialect } from 'kysely-bun-sqlite';

export const bunDb = new Database(process.env.DATABASE_PATH);

export const dialect = new BunSqliteDialect({
  database: bunDb,
});

export const db = new Kysely({
  dialect,
});
