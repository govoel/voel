import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export const initialTables = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    create table "user" (
      "id" text not null primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" integer not null,
      "image" text,
      "username" text unique,
      "displayUsername" text,
      "role" text,
      "banned" integer,
      "banReason" text,
      "banExpires" date,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    create table "session" (
      "id" text not null primary key,
      "expiresAt" date not null,
      "token" text not null unique,
      "ipAddress" text,
      "userAgent" text,
      "userId" text not null references "user" ("id") on delete cascade,
      "impersonatedBy" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    create index "session_userId_idx" on "session" ("userId");

    create table "account" (
      "id" text not null primary key,
      "accountId" text not null,
      "providerId" text not null,
      "userId" text not null references "user" ("id") on delete cascade,
      "accessToken" text,
      "refreshToken" text,
      "idToken" text,
      "accessTokenExpiresAt" date,
      "refreshTokenExpiresAt" date,
      "scope" text,
      "password" text,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    create index "account_userId_idx" on "account" ("userId");

    create table "verification" (
      "id" text not null primary key,
      "identifier" text not null,
      "value" text not null,
      "expiresAt" date not null,
      "createdAt" date not null,
      "updatedAt" date not null
    );

    create index "verification_identifier_idx" on "verification" ("identifier");
  `;
});
