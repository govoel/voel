import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export const baseTables = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    create table accounts (
      "serverUrl" text not null,
      "username" text not null,
      "active" integer not null default 0 check ("active" in (0, 1)),
      "createdAt" integer not null default (unixepoch()),
      "updatedAt" integer not null default (unixepoch()),
      primary key ("serverUrl", "username")
    ) strict;
  `;

  yield* sql`create unique index clientAccount_active_uniqueidx on accounts (active) where active = 1;`;

  yield* sql`
    create trigger clientAccount_updatedAt_trigger before update of serverUrl, username, active on accounts for each row begin
      update clientAccount set updatedAt = (unixepoch()) where id = new.id;
    end;
  `;
});
