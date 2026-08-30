import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table account (
      serverurl text not null,
      userid text not null,
      username text not null,
      name text not null,
      email text not null,
      authstorageid text not null,
      role text not null check (role in ('admin', 'user', 'under18')),
      profilepicture text,
      active integer not null default 0 check (active in (0, 1)),
      createdat integer not null default (time_to_milli (time_now ())),
      updatedat integer not null default (time_to_milli (time_now ())),
      constraint account_serverurl_userid_pkey primary key (serverurl, userid)
    ) strict
  `;

  yield* sql`
    create unique index account_serverurl_userid_authstorageid_uniqueidx on account (serverurl, userid, authstorageid)
  `;

  yield* sql`
    create unique index account_active_uniqueidx on account (active)
    where
      active = 1
  `;

  yield* sql`
    create trigger if not exists account_updatedat_trigger after
    update of serverurl,
    userid,
    username,
    name,
    email,
    authstorageid,
    role,
    profilepicture,
    active on account for each row begin
    update account
    set
      updatedat = (time_to_milli (time_now ()))
    where
      rowid = new.rowid;

    end
  `;
});
