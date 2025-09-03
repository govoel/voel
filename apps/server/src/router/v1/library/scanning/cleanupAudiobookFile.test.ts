import { Path } from '@effect/platform';
import { SystemError } from '@effect/platform/Error';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import { FileMigrationProvider, Migrator, sql } from 'kysely';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FsExtended } from '@/router/v1/library/fsExtended';

// Minimal FsExtended mock: provide `access` that succeeds for given paths.
const makeFsLayer = (existingPaths: Set<string>) =>
  Layer.succeed(
    FsExtended,
    new FsExtended({
      access: (path: string) =>
        existingPaths.has(path)
          ? Effect.succeed(true)
          : Effect.fail(
              new SystemError({ module: 'FileSystem', reason: 'NotFound', method: 'access' })
            ),
      realpath: () => Effect.die('not implemented'),
      lstat: () => Effect.die('not implemented'),
      stat: () => Effect.die('not implemented'),
      opendir: () => Effect.die('not implemented'),
      ffprobe: () => Effect.die('not implemented'),
    })
  );

describe('cleanupAudiobookFile', () => {
  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    const { db } = await import('@/libs/db');
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(
          import.meta.dir,
          '..',
          '..',
          '..',
          '..',
          'libs',
          'db',
          'migrations'
        ),
      }),
    });
    await migrator.migrateToLatest().catch((err) => {
      console.error('Error while migrating database...', err);
    });
  });

  beforeEach(async () => {
    const { db } = await import('@/libs/db');
    await sql`PRAGMA foreign_keys = OFF;`.execute(db);
  });

  afterEach(async () => {
    const { db } = await import('@/libs/db');
    await sql`delete from "audiobookFile"`.execute(db);
    await sql`delete from "unidentifiedAudiobookFile"`.execute(db);
    await sql`delete from "book"`.execute(db);
    await sql`delete from "library"`.execute(db);
  });

  describe('cleanupAudiobookFile', () => {
    it('removes audiobookFile row if file is missing', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: 1,
          bookId: 1,
          path: '/missing/file.mp3',
          mtimeMs: 0,
          metadataHash: '',
          durationMs: 0,
          disc: 0,
          track: 0,
        })
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set()), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 1 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('only affects rows for the given libraryId', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      await db
        .insertInto('audiobookFile')
        .values([
          {
            libraryId: 11,
            bookId: 11,
            path: '/lib11/missing.mp3',
            mtimeMs: 0,
            metadataHash: '',
            durationMs: 0,
            disc: 0,
            track: 0,
          },
          {
            libraryId: 12,
            bookId: 12,
            path: '/lib12/existing.mp3',
            mtimeMs: 0,
            metadataHash: '',
            durationMs: 0,
            disc: 0,
            track: 0,
          },
        ])
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set(['/lib12/existing.mp3'])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 12 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select(['audiobookFile.path'])
        .execute();

      // libraryId 11 row should be removed (missing file), libraryId 12 should remain
      expect(rows).toHaveLength(2);
    });

    it('keeps audiobookFile row when file exists', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: 2,
          bookId: 2,
          path: '/existing/file.mp3',
          mtimeMs: 0,
          metadataHash: '',
          durationMs: 0,
          disc: 0,
          track: 0,
        })
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set(['/existing/file.mp3'])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 2 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows).toHaveLength(1);
    });

    it('removes audiobookFile when parent dir contains .nomedia', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/root/dir/file.mp3';

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: 3,
          bookId: 3,
          path: filePath,
          mtimeMs: 0,
          metadataHash: '',
          durationMs: 0,
          disc: 0,
          track: 0,
        })
        .execute();

      const nomediaPath = path.join(path.dirname(filePath), '.nomedia');

      const layer = Layer.merge(makeFsLayer(new Set([nomediaPath, filePath])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 3 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('removes audiobookFile when parent dir contains .voelignore', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/root/dir2/file.mp3';

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: 4,
          bookId: 4,
          path: filePath,
          mtimeMs: 0,
          metadataHash: '',
          durationMs: 0,
          disc: 0,
          track: 0,
        })
        .execute();

      const voelignorePath = path.join(path.dirname(filePath), '.voelignore');

      const layer = Layer.merge(makeFsLayer(new Set([voelignorePath, filePath])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 4 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('keeps audiobookFile when an ancestor directory contains .nomedia', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/a/b/c/d/file.mp3';

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: 13,
          bookId: 13,
          path: filePath,
          mtimeMs: 0,
          metadataHash: '',
          durationMs: 0,
          disc: 0,
          track: 0,
        })
        .execute();

      // place .nomedia in /a/b (ancestor of the file)
      const nomediaPath = path.join('/a/b', '.nomedia');

      const layer = Layer.merge(makeFsLayer(new Set([nomediaPath, filePath])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 13 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows).toHaveLength(1);
    });

    it('keeps audiobookFile when file exists and no ignore markers in ancestors', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAudiobookFile } = await import('./cleanupAudiobookFile');

      const file1 = '/m/keep1.mp3';
      const file2 = '/m/keep2.mp3';

      await db
        .insertInto('audiobookFile')
        .values([
          {
            libraryId: 14,
            bookId: 14,
            path: file1,
            mtimeMs: 0,
            metadataHash: '',
            durationMs: 0,
            disc: 0,
            track: 0,
          },
          {
            libraryId: 14,
            bookId: 15,
            path: file2,
            mtimeMs: 0,
            metadataHash: '',
            durationMs: 0,
            disc: 0,
            track: 0,
          },
        ])
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set([file1, file2])), Path.layer);

      await Effect.runPromise(cleanupAudiobookFile({ libraryId: 14 }).pipe(Effect.provide(layer)));

      const rows = await db
        .selectFrom('audiobookFile')
        .where('audiobookFile.deletedAt', 'is', null)
        .select('audiobookFile.path')
        .execute();

      expect(rows.map((r) => r.path).sort()).toEqual([file1, file2].sort());
    });
  });

  describe('cleanupUnidentifiedAudiobookFile', () => {
    it('removes unidentifiedAudiobookFile if file is missing', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values({
          libraryId: 5,
          path: '/missing/unidentified.mp3',
          durationMs: 0,
          disc: 0,
          track: 0,
          reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
          mtimeMs: 0,
          metadataHash: '',
          metadata: '{}',
        })
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set()), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 5 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select('unidentifiedAudiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('removes unidentifiedAudiobookFile when parent dir contains .nomedia', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/x/y/unidentified.mp3';

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values({
          libraryId: 6,
          path: filePath,
          durationMs: 0,
          disc: 0,
          track: 0,
          reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
          mtimeMs: 0,
          metadataHash: '',
          metadata: '{}',
        })
        .execute();

      const nomediaPath = path.join(path.dirname(filePath), '.nomedia');

      const layer = Layer.merge(makeFsLayer(new Set([nomediaPath])), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 6 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select('unidentifiedAudiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('keeps unidentifiedAudiobookFile when file exists', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/existing/unidentified.mp3';

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values({
          libraryId: 8,
          path: filePath,
          durationMs: 0,
          disc: 0,
          track: 0,
          reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
          mtimeMs: 0,
          metadataHash: '',
          metadata: '{}',
        })
        .execute();

      const layer = Layer.merge(makeFsLayer(new Set([filePath])), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 8 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select('unidentifiedAudiobookFile.path')
        .execute();

      expect(rows).toHaveLength(1);
    });

    it('removes unidentifiedAudiobookFile when parent dir contains .voelignore', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/z/w/unidentified.mp3';

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values({
          libraryId: 9,
          path: filePath,
          durationMs: 0,
          disc: 0,
          track: 0,
          reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
          mtimeMs: 0,
          metadataHash: '',
          metadata: '{}',
        })
        .execute();

      const voelignorePath = path.join(path.dirname(filePath), '.voelignore');

      const layer = Layer.merge(makeFsLayer(new Set([voelignorePath])), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 9 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select('unidentifiedAudiobookFile.path')
        .execute();

      expect(rows).toHaveLength(0);
    });

    it('keeps unidentifiedAudiobookFile when an ancestor directory contains .voelignore', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      const filePath = '/p/q/r/s/unidentified.mp3';

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values({
          libraryId: 20,
          path: filePath,
          durationMs: 0,
          disc: 0,
          track: 0,
          reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
          mtimeMs: 0,
          metadataHash: '',
          metadata: '{}',
        })
        .execute();

      // .voelignore placed in /p (ancestor of the file)
      const voelignorePath = path.join('/p', '.voelignore');

      const layer = Layer.merge(makeFsLayer(new Set([voelignorePath, filePath])), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 20 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select('unidentifiedAudiobookFile.path')
        .execute();

      expect(rows).toHaveLength(1);
    });

    it('keeps unidentifiedAudiobookFile when mixed: some exist, some ignored in other library', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupUnidentifiedAudiobookFile } = await import('./cleanupAudiobookFile');

      const fileA = '/mixed/existingA.mp3';
      const fileB = '/mixed/missingB.mp3';
      const fileC = '/other/existingC.mp3';

      await db
        .insertInto('unidentifiedAudiobookFile')
        .values([
          {
            libraryId: 21,
            path: fileA,
            durationMs: 0,
            disc: 0,
            track: 0,
            reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
            mtimeMs: 0,
            metadataHash: '',
            metadata: '{}',
          },
          {
            libraryId: 21,
            path: fileB,
            durationMs: 0,
            disc: 0,
            track: 0,
            reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
            mtimeMs: 0,
            metadataHash: '',
            metadata: '{}',
          },
          {
            libraryId: 22,
            path: fileC,
            durationMs: 0,
            disc: 0,
            track: 0,
            reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
            mtimeMs: 0,
            metadataHash: '',
            metadata: '{}',
          },
        ])
        .execute();

      // only fileA exists for library 21; fileC exists but in different library
      const layer = Layer.merge(makeFsLayer(new Set([fileA, fileC])), Path.layer);

      await Effect.runPromise(
        cleanupUnidentifiedAudiobookFile({ libraryId: 21 }).pipe(Effect.provide(layer))
      );

      const rows = await db
        .selectFrom('unidentifiedAudiobookFile')
        .where('unidentifiedAudiobookFile.deletedAt', 'is', null)
        .select(['unidentifiedAudiobookFile.libraryId', 'unidentifiedAudiobookFile.path'])
        .execute();

      // For library 21 only fileA should remain; for library 22 fileC remains untouched
      const remaining = rows.map((r) => ({ lib: r.libraryId, path: r.path }));
      expect(remaining).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lib: 21, path: fileA }),
          expect.objectContaining({ lib: 22, path: fileC }),
        ])
      );
      // missing fileB should have been removed
      expect(remaining.find((r) => r.path === fileB)).toBeUndefined();
    });
  });
});
