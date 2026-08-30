import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE account (
      serverUrl TEXT NOT NULL,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      authStorageId TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'under18')),
      profilePicture TEXT,
      active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
      createdAt INTEGER NOT NULL DEFAULT (time_to_milli(time_now())),
      updatedAt INTEGER NOT NULL DEFAULT (time_to_milli(time_now())),
      CONSTRAINT account_serverUrl_userId_pkey PRIMARY KEY (serverUrl, userId)
    ) STRICT
  `;

  yield* sql`
    CREATE UNIQUE INDEX account_serverUrl_userId_authStorageId_uniqueidx
    ON account (serverUrl, userId, authStorageId)
  `;

  yield* sql`
    CREATE UNIQUE INDEX account_active_uniqueidx
    ON account (active) WHERE active = 1
  `;

  yield* sql`
    CREATE TRIGGER IF NOT EXISTS account_updatedAt_trigger
    AFTER UPDATE OF serverUrl, userId, username, name, email, authStorageId, role,
      profilePicture, active ON account
    FOR EACH ROW BEGIN
      UPDATE account SET updatedAt = (time_to_milli(time_now())) WHERE rowid = new.rowid;
    END
  `;
});
