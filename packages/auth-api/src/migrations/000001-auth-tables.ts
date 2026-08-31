import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table "user" (
      "id" text not null primary key,
      "name" text not null,
      "email" text not null unique,
      "emailVerified" integer not null,
      "image" text,
      "createdAt" date not null,
      "updatedAt" date not null,
      "username" text unique,
      "role" text,
      "banned" integer,
      "banReason" text,
      "banExpires" date
    )
  `;

  yield* sql`
    create table "session" (
      "id" text not null primary key,
      "expiresAt" date not null,
      "token" text not null unique,
      "createdAt" date not null,
      "updatedAt" date not null,
      "ipAddress" text,
      "userAgent" text,
      "userId" text not null references "user" ("id") on delete cascade,
      "impersonatedBy" text
    )
  `;

  yield* sql`
    create table "account" (
      "id" text not null primary key,
      "issuer" text not null,
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
    )
  `;

  yield* sql`
    create table "verification" (
      "id" text not null primary key,
      "identifier" text not null,
      "value" text not null,
      "expiresAt" date not null,
      "createdAt" date not null,
      "updatedAt" date not null
    )
  `;

  yield* sql`
    create index "session_userId_idx" on "session" ("userId")
  `;
  yield* sql`
    create index "account_userId_idx" on "account" ("userId")
  `;
  yield* sql`
    create index "verification_identifier_idx" on "verification" ("identifier")
  `;
  yield* sql`
    create unique index "account_issuer_accountId_uidx" on "account" ("issuer", "accountId")
  `;
});
