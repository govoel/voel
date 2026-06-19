import { Context, Effect, Layer } from 'effect';

import { createDatabase, sql } from '@repo/source-tap';
import type { EffectKysely, SourceTap } from '@repo/source-tap';

import { ApiConfig } from '#src/services/config.ts';
import type { DatabaseTables } from '#src/services/database/schema.ts';

import { runDatabaseMigrations } from './migrations';

class Database extends Context.Service<
  Database,
  { db: EffectKysely<DatabaseTables>; sourceTap: SourceTap<DatabaseTables> }
>()('@repo/server/services/database/index/Database', {
  make: Effect.fnUntraced(function* ({ filename }: { filename: string }) {
    const { db, sourceTap, kysely } = yield* createDatabase<DatabaseTables>({
      filename,
      trackTables: new Set([
        'mediaType',
        'mediaItem',
        'audiobook',
        'audiobookSeries',
        'audiobookSeriesMap',
        'audiobookContributor',
        'audiobookContributorRole',
        'audiobookContributorMap',
        'library',
        'libraryPath',
        'mediaFile',
        'libraryFileMap',
      ] as const),
    });

    yield* db.executeRaw(sql`PRAGMA journal_mode = WAL`);
    yield* db.executeRaw(sql`PRAGMA foreign_keys = ON`);
    yield* db.executeRaw(sql`PRAGMA synchronous = NORMAL`);

    yield* runDatabaseMigrations({ db: kysely });

    return { db, sourceTap };
  }),
}) {
  public static readonly layer = Layer.effect(
    this,
    Effect.service(ApiConfig).pipe(
      Effect.flatMap((config) => this.make({ filename: config.db.filename }))
    )
  );
}
