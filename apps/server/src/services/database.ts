import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql';

import { ApiConfig } from '#src/services/config.ts';

export const DatabaseLive = Layer.provideMerge(
  Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;
      yield* sql`PRAGMA synchronous = NORMAL`;
    })
  ),
  Effect.service(ApiConfig).pipe(
    Effect.map((config) => SqliteClient.layer({ filename: config.db.filename, disableWAL: false })),
    Layer.unwrap
  )
);
