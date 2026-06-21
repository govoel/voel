import { Context, Effect, Layer } from 'effect';

import type { EffectKysely } from '@repo/effect-kysely';
import { createDatabase, sql } from '@repo/source-tap';
import type { Kysely, SourceTap } from '@repo/source-tap';
import type { DatabaseTables } from '@repo/spec-api/database/schema.ts';

import { ApiConfig } from '#src/services/config.ts';

import { runDatabaseMigrations } from './migrations';

export class Database extends Context.Service<
  Database,
  {
    db: EffectKysely<DatabaseTables>;
    sourceTap: SourceTap<DatabaseTables>;
    kysely: Kysely<DatabaseTables>;
  }
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

    return { db, sourceTap, kysely };
  }),
}) {
  public static readonly layer = Layer.effect(
    this,
    Effect.service(ApiConfig).pipe(
      Effect.flatMap((config) => this.make({ filename: config.db.filename }))
    )
  );

  public static readonly layerTest = (args: Parameters<(typeof this)['make']>['0']) =>
    Layer.effect(this, this.make(args));
}
