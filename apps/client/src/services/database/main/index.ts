import { Context, Effect, Layer, Schema } from 'effect';

import { Kysely, ParseJSONResultsPlugin, makeFromKysely, sql } from '@repo/effect-kysely';
import type { EffectKysely } from '@repo/effect-kysely';

import { OpSqliteDialect } from '#src/services/database/dialect.ts';
import { runDatabaseMigrations } from '#src/services/database/main/migrations.ts';
import type { MainDatabaseTables } from '#src/services/database/main/schema.ts';

export class ClientDatabaseMigrationError extends Schema.TaggedErrorClass<
  ClientDatabaseMigrationError,
  { readonly brand: unique symbol }
>()('voel/services/database/index/ClientDatabaseMigrationError', {}) {}

export class MainDatabase extends Context.Service<MainDatabase, EffectKysely<MainDatabaseTables>>()(
  'voel/services/database/main/index/MainDatabase',
  {
    make: ({ filename }: { filename: string }) =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          const kysely = new Kysely<MainDatabaseTables>({
            dialect: new OpSqliteDialect({ filename }),
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
  public static readonly layer = (args: Parameters<(typeof this)['make']>['0']) =>
    Layer.effect(this, this.make(args));

  public static readonly layerTest = (args: Parameters<(typeof this)['make']>['0']) =>
    Layer.effect(this, this.make(args));
}
