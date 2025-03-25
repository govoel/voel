import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "username" text unique, "displayUsername" text, "role" text, "banned" integer, "banReason" text, "banExpires" date);
  await db.schema
    .createTable('user')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
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

  // create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id"), "impersonatedBy" text);
  await db.schema
    .createTable('session')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
    .addColumn('expiresAt', 'date', (col) => col.notNull())
    .addColumn('token', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .addColumn('ipAddress', 'text')
    .addColumn('userAgent', 'text')
    .addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
    .addColumn('impersonatedBy', 'text')
    .execute();

  // create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id"), "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
  await db.schema
    .createTable('account')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
    .addColumn('accountId', 'text', (col) => col.notNull())
    .addColumn('providerId', 'text', (col) => col.notNull())
    .addColumn('userId', 'text', (col) => col.notNull().references('user.id'))
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

  // create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date, "updatedAt" date);
  await db.schema
    .createTable('verification')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
    .addColumn('identifier', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('expiresAt', 'date', (col) => col.notNull())
    .addColumn('createdAt', 'date', (col) => col.notNull())
    .addColumn('updatedAt', 'date', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user').ifExists().execute();
  await db.schema.dropTable('session').ifExists().execute();
  await db.schema.dropTable('account').ifExists().execute();
  await db.schema.dropTable('verification').ifExists().execute();
}
