import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import { FileMigrationProvider, Migrator, sql } from 'kysely';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('cleanupOrphanedRecords', () => {
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

  afterEach(async () => {
    const { db } = await import('@/libs/db');
    await sql`PRAGMA foreign_keys = OFF;`.execute(db);
    await sql`delete from "audiobookChapter"`.execute(db);
    await sql`delete from "audiobookFile"`.execute(db);
    await sql`delete from "bookContributor"`.execute(db);
    await sql`delete from "bookSeries"`.execute(db);
    await sql`delete from "book"`.execute(db);
    await sql`delete from "series"`.execute(db);
    await sql`delete from "contributor"`.execute(db);
    await sql`delete from "library"`.execute(db);
    await sql`PRAGMA foreign_keys = ON;`.execute(db);
  });

  describe('cleanupOrphanedBooks', () => {
    it('should soft-delete a book with no active audiobook files', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBooks } = await import('./cleanupOrphanedRecords');

      // Create a library
      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create a book
      const book = await db
        .insertInto('book')
        .values({
          asin: 'ASIN123',
          type: 'audio',
          title: 'Test Book',
          adultsOnly: 0,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create a soft-deleted audiobook file for the book
      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book.id,
          path: '/test/file.m4b',
          partialFileHash: 'hash123',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      // Soft-delete the file
      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.path', '=', '/test/file.m4b')
        .execute();

      // Run cleanup
      const result = await Effect.runPromise(cleanupOrphanedBooks());

      expect(result.deletedCount).toBe(1);

      // Verify book is soft-deleted
      const deletedBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(deletedBook.deletedAt).not.toBeNull();
    });

    it('should not delete a book with active audiobook files', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBooks } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({
          asin: 'ASIN123',
          type: 'audio',
          title: 'Test Book',
          adultsOnly: 0,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create an active audiobook file
      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book.id,
          path: '/test/file.m4b',
          partialFileHash: 'hash123',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedBooks());

      expect(result.deletedCount).toBe(0);

      const activeBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(activeBook.deletedAt).toBeNull();
    });

    it('should handle books with some deleted and some active files correctly', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBooks } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({
          asin: 'ASIN123',
          type: 'audio',
          title: 'Test Book',
          adultsOnly: 0,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create one active and one deleted file for the same book
      await db
        .insertInto('audiobookFile')
        .values([
          {
            libraryId: library.id,
            bookId: book.id,
            path: '/test/file1.m4b',
            partialFileHash: 'hash1',
            durationMs: 1000,
            disc: 1,
            track: 1,
            mtimeMs: 1000,
          },
          {
            libraryId: library.id,
            bookId: book.id,
            path: '/test/file2.m4b',
            partialFileHash: 'hash2',
            durationMs: 1000,
            disc: 1,
            track: 2,
            mtimeMs: 1000,
          },
        ])
        .execute();

      // Soft-delete one of the files
      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.path', '=', '/test/file1.m4b')
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedBooks());

      // Book should NOT be deleted because it still has one active file
      expect(result.deletedCount).toBe(0);

      const activeBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(activeBook.deletedAt).toBeNull();
    });

    it('should handle multiple books with mixed file states', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBooks } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Book 1: all files deleted
      const book1 = await db
        .insertInto('book')
        .values({ asin: 'ASIN1', type: 'audio', title: 'Book 1', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book1.id,
          path: '/test/book1.m4b',
          partialFileHash: 'hash1',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.path', '=', '/test/book1.m4b')
        .execute();

      // Book 2: has active files
      const book2 = await db
        .insertInto('book')
        .values({ asin: 'ASIN2', type: 'audio', title: 'Book 2', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book2.id,
          path: '/test/book2.m4b',
          partialFileHash: 'hash2',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      // Book 3: all files deleted
      const book3 = await db
        .insertInto('book')
        .values({ asin: 'ASIN3', type: 'audio', title: 'Book 3', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book3.id,
          path: '/test/book3.m4b',
          partialFileHash: 'hash3',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.path', '=', '/test/book3.m4b')
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedBooks());

      // Book 1 and 3 should be deleted
      expect(result.deletedCount).toBe(2);

      const book1After = await db
        .selectFrom('book')
        .where('book.id', '=', book1.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(book1After.deletedAt).not.toBeNull();

      const book2After = await db
        .selectFrom('book')
        .where('book.id', '=', book2.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(book2After.deletedAt).toBeNull();

      const book3After = await db
        .selectFrom('book')
        .where('book.id', '=', book3.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(book3After.deletedAt).not.toBeNull();
    });
  });

  describe('cleanupOrphanedContributors', () => {
    it('should soft-delete a contributor with no active book associations', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedContributors } = await import('./cleanupOrphanedRecords');

      // Create contributor without any book associations
      const contributor = await db
        .insertInto('contributor')
        .values({
          asin: 'CONTRIB123',
          name: 'Test Author',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const result = await Effect.runPromise(cleanupOrphanedContributors());

      expect(result.deletedCount).toBe(1);

      const deletedContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', contributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(deletedContributor.deletedAt).not.toBeNull();
    });

    it('should not delete a contributor with active book associations', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedContributors } = await import('./cleanupOrphanedRecords');

      const contributor = await db
        .insertInto('contributor')
        .values({ asin: 'CONTRIB123', name: 'Test Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create active book contributor association
      await db
        .insertInto('bookContributor')
        .values({
          bookId: book.id,
          contributorId: contributor.id,
          name: 'Test Author',
          role: 'author',
        })
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedContributors());

      expect(result.deletedCount).toBe(0);

      const activeContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', contributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(activeContributor.deletedAt).toBeNull();
    });

    it('should delete contributor when all book associations are soft-deleted', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedContributors } = await import('./cleanupOrphanedRecords');

      const contributor = await db
        .insertInto('contributor')
        .values({ asin: 'CONTRIB123', name: 'Test Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookContributor')
        .values({
          bookId: book.id,
          contributorId: contributor.id,
          name: 'Test Author',
          role: 'author',
        })
        .execute();

      // Soft-delete the book contributor association
      await db
        .updateTable('bookContributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookContributor.bookId', '=', book.id)
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedContributors());

      expect(result.deletedCount).toBe(1);

      const deletedContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', contributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(deletedContributor.deletedAt).not.toBeNull();
    });
  });

  describe('cleanupOrphanedSeries', () => {
    it('should soft-delete a series with no active book associations', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedSeries } = await import('./cleanupOrphanedRecords');

      const series = await db
        .insertInto('series')
        .values({ asin: 'SERIES123', name: 'Test Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const result = await Effect.runPromise(cleanupOrphanedSeries());

      expect(result.deletedCount).toBe(1);

      const deletedSeries = await db
        .selectFrom('series')
        .where('series.id', '=', series.id)
        .select(['series.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(deletedSeries.deletedAt).not.toBeNull();
    });

    it('should not delete a series with active book associations', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedSeries } = await import('./cleanupOrphanedRecords');

      const series = await db
        .insertInto('series')
        .values({ asin: 'SERIES123', name: 'Test Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookSeries')
        .values({
          bookId: book.id,
          seriesId: series.id,
          title: 'Test Series',
          label: 'Book 1',
          sort: 1,
        })
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedSeries());

      expect(result.deletedCount).toBe(0);

      const activeSeries = await db
        .selectFrom('series')
        .where('series.id', '=', series.id)
        .select(['series.deletedAt'])
        .executeTakeFirstOrThrow();

      expect(activeSeries.deletedAt).toBeNull();
    });
  });

  describe('cleanupOrphanedChapters', () => {
    it('should soft-delete chapters belonging to soft-deleted books', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedChapters } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const file = await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book.id,
          path: '/test/file.m4b',
          partialFileHash: 'hash123',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create chapters for the book
      await db
        .insertInto('audiobookChapter')
        .values([
          {
            bookId: book.id,
            fileId: file.id,
            source: 'file',
            title: 'Chapter 1',
            durationMs: 500,
            startOffsetMs: 0,
          },
          {
            bookId: book.id,
            fileId: null,
            parentId: null,
            source: 'audible',
            title: 'Chapter 2',
            durationMs: 500,
            startOffsetMs: 500,
          },
        ])
        .execute();

      // Soft-delete the book
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedChapters());

      expect(result.deletedCount).toBe(2);

      const chapters = await db
        .selectFrom('audiobookChapter')
        .where('audiobookChapter.bookId', '=', book.id)
        .where('audiobookChapter.deletedAt', 'is', null)
        .select(['audiobookChapter.id'])
        .execute();

      expect(chapters).toHaveLength(0);
    });

    it('should soft-delete file chapters when their files are soft-deleted', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedChapters } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const file = await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book.id,
          path: '/test/file.m4b',
          partialFileHash: 'hash123',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create a file-based chapter
      await db
        .insertInto('audiobookChapter')
        .values({
          bookId: book.id,
          fileId: file.id,
          source: 'file',
          title: 'Chapter 1',
          durationMs: 1000,
          startOffsetMs: 0,
        })
        .execute();

      // Soft-delete the file
      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.id', '=', file.id)
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedChapters());

      expect(result.deletedCount).toBe(1);
    });
  });

  describe('cleanupOrphanedBookContributors', () => {
    it('should soft-delete book contributors for deleted books', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBookContributors } = await import('./cleanupOrphanedRecords');

      const contributor = await db
        .insertInto('contributor')
        .values({ asin: 'CONTRIB123', name: 'Test Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookContributor')
        .values({
          bookId: book.id,
          contributorId: contributor.id,
          name: 'Test Author',
          role: 'author',
        })
        .execute();

      // Soft-delete the book
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedBookContributors());

      expect(result.deletedCount).toBe(1);

      const bookContributors = await db
        .selectFrom('bookContributor')
        .where('bookContributor.bookId', '=', book.id)
        .where('bookContributor.deletedAt', 'is', null)
        .select(['bookContributor.id'])
        .execute();

      expect(bookContributors).toHaveLength(0);
    });
  });

  describe('cleanupOrphanedBookSeries', () => {
    it('should soft-delete book series for deleted books', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupOrphanedBookSeries } = await import('./cleanupOrphanedRecords');

      const series = await db
        .insertInto('series')
        .values({ asin: 'SERIES123', name: 'Test Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookSeries')
        .values({
          bookId: book.id,
          seriesId: series.id,
          title: 'Test Series',
          label: 'Book 1',
          sort: 1,
        })
        .execute();

      // Soft-delete the book
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      const result = await Effect.runPromise(cleanupOrphanedBookSeries());

      expect(result.deletedCount).toBe(1);

      const bookSeries = await db
        .selectFrom('bookSeries')
        .where('bookSeries.bookId', '=', book.id)
        .where('bookSeries.deletedAt', 'is', null)
        .select(['bookSeries.id'])
        .execute();

      expect(bookSeries).toHaveLength(0);
    });
  });

  describe('cleanupAllOrphanedRecords', () => {
    it('should cleanup all orphaned records in correct order', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAllOrphanedRecords } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const contributor = await db
        .insertInto('contributor')
        .values({ asin: 'CONTRIB123', name: 'Test Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const series = await db
        .insertInto('series')
        .values({ asin: 'SERIES123', name: 'Test Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const file = await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book.id,
          path: '/test/file.m4b',
          partialFileHash: 'hash123',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookContributor')
        .values({
          bookId: book.id,
          contributorId: contributor.id,
          name: 'Test Author',
          role: 'author',
        })
        .execute();

      await db
        .insertInto('bookSeries')
        .values({
          bookId: book.id,
          seriesId: series.id,
          title: 'Test Series',
          label: 'Book 1',
          sort: 1,
        })
        .execute();

      await db
        .insertInto('audiobookChapter')
        .values({
          bookId: book.id,
          fileId: file.id,
          source: 'file',
          title: 'Chapter 1',
          durationMs: 1000,
          startOffsetMs: 0,
        })
        .execute();

      // Soft-delete the file (which should cascade to orphan the book)
      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.id', '=', file.id)
        .execute();

      const result = await Effect.runPromise(cleanupAllOrphanedRecords());

      // Should delete: 1 book, 1 book contributor, 1 book series, 1 chapter, 1 contributor, 1 series
      expect(result.books).toBe(1);
      expect(result.bookContributors).toBe(1);
      expect(result.bookSeries).toBe(1);
      expect(result.chapters).toBe(1);
      expect(result.contributors).toBe(1);
      expect(result.series).toBe(1);

      // Verify everything is soft-deleted
      const activeBook = await db
        .selectFrom('book')
        .where('book.deletedAt', 'is', null)
        .select(['book.id'])
        .execute();
      expect(activeBook).toHaveLength(0);

      const activeContributor = await db
        .selectFrom('contributor')
        .where('contributor.deletedAt', 'is', null)
        .select(['contributor.id'])
        .execute();
      expect(activeContributor).toHaveLength(0);

      const activeSeries = await db
        .selectFrom('series')
        .where('series.deletedAt', 'is', null)
        .select(['series.id'])
        .execute();
      expect(activeSeries).toHaveLength(0);
    });

    it('should handle complex multi-book scenario with shared contributors and series', async () => {
      const { db } = await import('@/libs/db');
      const { cleanupAllOrphanedRecords } = await import('./cleanupOrphanedRecords');

      const library = await db
        .insertInto('library')
        .values({ name: 'TestLibrary', path: '/test/library' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create a shared contributor (author who wrote multiple books)
      const sharedContributor = await db
        .insertInto('contributor')
        .values({ asin: 'CONTRIB_SHARED', name: 'Prolific Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create a shared series
      const sharedSeries = await db
        .insertInto('series')
        .values({ asin: 'SERIES_SHARED', name: 'Epic Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create Book 1 (will have files deleted)
      const book1 = await db
        .insertInto('book')
        .values({ asin: 'ASIN1', type: 'audio', title: 'Book 1', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const file1 = await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book1.id,
          path: '/test/book1.m4b',
          partialFileHash: 'hash1',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookContributor')
        .values({
          bookId: book1.id,
          contributorId: sharedContributor.id,
          name: 'Prolific Author',
          role: 'author',
        })
        .execute();

      await db
        .insertInto('bookSeries')
        .values({
          bookId: book1.id,
          seriesId: sharedSeries.id,
          title: 'Epic Series',
          label: 'Book 1',
          sort: 1,
        })
        .execute();

      await db
        .insertInto('audiobookChapter')
        .values({
          bookId: book1.id,
          fileId: file1.id,
          source: 'file',
          title: 'Chapter 1',
          durationMs: 1000,
          startOffsetMs: 0,
        })
        .execute();

      // Create Book 2 (will remain active, shares contributor and series)
      const book2 = await db
        .insertInto('book')
        .values({ asin: 'ASIN2', type: 'audio', title: 'Book 2', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('audiobookFile')
        .values({
          libraryId: library.id,
          bookId: book2.id,
          path: '/test/book2.m4b',
          partialFileHash: 'hash2',
          durationMs: 1000,
          disc: 1,
          track: 1,
          mtimeMs: 1000,
        })
        .execute();

      await db
        .insertInto('bookContributor')
        .values({
          bookId: book2.id,
          contributorId: sharedContributor.id,
          name: 'Prolific Author',
          role: 'author',
        })
        .execute();

      await db
        .insertInto('bookSeries')
        .values({
          bookId: book2.id,
          seriesId: sharedSeries.id,
          title: 'Epic Series',
          label: 'Book 2',
          sort: 2,
        })
        .execute();

      // Soft-delete Book 1's file
      await db
        .updateTable('audiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookFile.id', '=', file1.id)
        .execute();

      const result = await Effect.runPromise(cleanupAllOrphanedRecords());

      // Should delete: 1 book, 1 book contributor, 1 book series, 1 chapter
      // Should NOT delete: shared contributor or shared series (still used by book2)
      expect(result.books).toBe(1);
      expect(result.bookContributors).toBe(1);
      expect(result.bookSeries).toBe(1);
      expect(result.chapters).toBe(1);
      expect(result.contributors).toBe(0); // Still used by book2
      expect(result.series).toBe(0); // Still used by book2

      // Verify shared contributor is still active
      const activeContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', sharedContributor.id)
        .where('contributor.deletedAt', 'is', null)
        .select(['contributor.id'])
        .executeTakeFirst();
      expect(activeContributor).not.toBeUndefined();

      // Verify shared series is still active
      const activeSeries = await db
        .selectFrom('series')
        .where('series.id', '=', sharedSeries.id)
        .where('series.deletedAt', 'is', null)
        .select(['series.id'])
        .executeTakeFirst();
      expect(activeSeries).not.toBeUndefined();
    });
  });
});
