import { Context, Effect, Layer } from 'effect';

import { Kysely, ParseJSONResultsPlugin, makeFromKysely, sql } from '@repo/effect-kysely';
import type { Dialect, EffectKysely } from '@repo/effect-kysely';

import { AppConfig } from '#src/services/config.ts';
import { runDatabaseMigrations } from '#src/services/database/main/migrations.ts';
import type { MainDatabaseTables } from '#src/services/database/main/schema.ts';

export class MainDatabase extends Context.Service<MainDatabase, EffectKysely<MainDatabaseTables>>()(
  'voel/services/database/main/MainDatabase',
  {
    make: ({ dialect }: { dialect: Dialect }) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          const kysely = new Kysely<MainDatabaseTables>({
            dialect,
            plugins: [new ParseJSONResultsPlugin()],
          });

          const db = makeFromKysely(kysely);

          yield* db.executeRaw(sql`PRAGMA journal_mode = WAL`);
          yield* db.executeRaw(sql`PRAGMA foreign_keys = ON`);
          yield* db.executeRaw(sql`PRAGMA synchronous = NORMAL`);

          yield* runDatabaseMigrations({ db: kysely });

          return db;
        }),
        (db) => Effect.promise(async () => db.destroy())
      ),
  }
) {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const { OpSqliteDialect } = yield* Effect.promise(
        async () => import('#src/services/database/dialect.ts')
      );

      return Layer.effect(
        MainDatabase,
        MainDatabase.make({
          dialect: new OpSqliteDialect({ filename: config.mainDb.filename }),
        })
      );
    })
  );
}
