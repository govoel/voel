import BunSqliteDatabase from 'bun:sqlite';

import { Effect, Layer } from 'effect';

import { BunSqliteDialect } from '@repo/effect-kysely/dialect.ts';

import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const MainDatabaseTestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig;

    return Layer.effect(
      MainDatabase,
      MainDatabase.make({
        dialect: new BunSqliteDialect({
          database: new BunSqliteDatabase(config.mainDb.filename),
        }),
      })
    );
  })
);
