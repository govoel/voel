import type { Kysely } from '@repo/effect-kysely';

export const up = async (db: Kysely<unknown>) => {
  await db.schema
    .createTable('user')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('emailVerified', 'integer', (col) => col.notNull())
    .addColumn('image', 'text')
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .addColumn('username', 'text', (col) => col.unique())
    .addColumn('displayUsername', 'text')
    .addColumn('role', 'text')
    .addColumn('banned', 'integer')
    .addColumn('banReason', 'text')
    .addColumn('banExpires', 'date')
    .execute();

  await db.schema
    .createTable('session')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('expiresAt', 'date', (col) => col.notNull())
    .addColumn('token', 'text', (col) => col.notNull().unique())
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .addColumn('ipAddress', 'text')
    .addColumn('userAgent', 'text')
    .addColumn('userId', 'text', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('impersonatedBy', 'text')
    .execute();

  await db.schema
    .createTable('account')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('accountId', 'text', (col) => col.notNull())
    .addColumn('providerId', 'text', (col) => col.notNull())
    .addColumn('userId', 'text', (col) => col.notNull().references('user.id').onDelete('cascade'))
    .addColumn('accessToken', 'text')
    .addColumn('refreshToken', 'text')
    .addColumn('idToken', 'text')
    .addColumn('accessTokenExpiresAt', 'date')
    .addColumn('refreshTokenExpiresAt', 'date')
    .addColumn('scope', 'text')
    .addColumn('password', 'text')
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('verification')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('identifier', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('expiresAt', 'date', (col) => col.notNull())
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .execute();

  await db.schema.createIndex('session_userId_idx').on('session').columns(['userId']).execute();
  await db.schema.createIndex('account_userId_idx').on('account').columns(['userId']).execute();
  await db.schema
    .createIndex('verification_identifier_idx')
    .on('verification')
    .columns(['identifier'])
    .execute();
};

export const down = async (db: Kysely<unknown>) => {
  await db.schema.dropTable('verification').ifExists().execute();
  await db.schema.dropTable('account').ifExists().execute();
  await db.schema.dropTable('session').ifExists().execute();
  await db.schema.dropTable('user').ifExists().execute();
};
