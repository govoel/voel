import { Context, Effect, Layer, Schema } from 'effect';

import { Kysely, ParseJSONResultsPlugin, makeFromKysely, sql } from '@repo/effect-kysely';
import type { Dialect, EffectKysely } from '@repo/effect-kysely';

import { runDatabaseMigrations } from '#src/services/database/main/migrations.ts';
import type { MainDatabaseTables } from '#src/services/database/main/schema.ts';

export class ClientDatabaseMigrationError extends Schema.TaggedErrorClass<
  ClientDatabaseMigrationError,
  { readonly brand: unique symbol }
>()('voel/services/database/index/ClientDatabaseMigrationError', {}) {}

export class MainDatabase extends Context.Service<MainDatabase, EffectKysely<MainDatabaseTables>>()(
  'voel/services/database/main/index/MainDatabase',
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
  public static readonly layer = ({ filename }: { filename: string }) =>
    Layer.effect(
      this,
      Effect.promise(async () => import('#src/services/database/dialect.ts')).pipe(
        Effect.flatMap(({ OpSqliteDialect }) =>
          this.make({ dialect: new OpSqliteDialect({ filename }) })
        )
      )
    );

  public static readonly layerTest = ({ filename }: { filename: string }) =>
    Layer.effect(
      this,
      Effect.all([
        Effect.promise(async () => import('@repo/effect-kysely/dialect.ts')),
        // @effect-diagnostics-next-line nodeBuiltinImport:off
        // oxlint-disable-next-line import/no-nodejs-modules
        Effect.promise(async () => import('node:sqlite')),
      ]).pipe(
        Effect.flatMap(([{ NodeSqliteDialect }, { DatabaseSync }]) =>
          this.make({
            dialect: new NodeSqliteDialect({
              database: new DatabaseSync(filename),
            }),
          })
        )
      )
    );
}
