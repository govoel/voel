import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table account (
      "serverUrl" text not null,
      "userId" text not null,
      username text not null,
      name text not null,
      email text not null,
      "authStorageId" text not null,
      role text not null check (role in ('admin', 'user', 'under18')),
      "profilePicture" text,
      active integer not null default 0 check (active in (0, 1)),
      "createdAt" integer not null default (time_to_milli (time_now ())),
      "updatedAt" integer not null default (time_to_milli (time_now ())),
      constraint "account_serverUrl_userId_pkey" primary key ("serverUrl", "userId")
    ) strict
  `;

  yield* sql`
    create unique index "account_serverUrl_userId_authStorageId_uniqueidx" on account ("serverUrl", "userId", "authStorageId")
  `;

  yield* sql`
    create unique index account_active_uniqueidx on account (active)
    where
      active = 1
  `;

  yield* sql`
    create trigger if not exists "account_updatedAt_trigger" after
    update of "serverUrl",
    "userId",
    username,
    name,
    email,
    "authStorageId",
    role,
    "profilePicture",
    active on account for each row begin
    update account
    set
      "updatedAt" = (time_to_milli (time_now ()))
    where
      rowid = new.rowid;

    end
  `;
});
