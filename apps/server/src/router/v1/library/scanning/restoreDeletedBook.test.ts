import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import { FileMigrationProvider, Migrator, sql } from 'kysely';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('restoreDeletedBook', () => {
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

  describe('restoreDeletedBook', () => {
    it('should restore a soft-deleted book and its associated records', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

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
            title: 'Audible Chapter',
            durationMs: 500,
            startOffsetMs: 500,
          },
        ])
        .execute();

      // Soft-delete everything
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      await db
        .updateTable('contributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('contributor.id', '=', contributor.id)
        .execute();

      await db
        .updateTable('series')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('series.id', '=', series.id)
        .execute();

      await db
        .updateTable('bookContributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookContributor.bookId', '=', book.id)
        .execute();

      await db
        .updateTable('bookSeries')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookSeries.bookId', '=', book.id)
        .execute();

      await db
        .updateTable('audiobookChapter')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('audiobookChapter.bookId', '=', book.id)
        .execute();

      // Verify everything is deleted before restore
      const deletedBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(deletedBook.deletedAt).not.toBeNull();

      // Restore the book
      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book.id }));

      expect(result.restored).toBe(true);

      // Verify book is restored
      const restoredBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredBook.deletedAt).toBeNull();

      // Verify book contributors are restored
      const restoredBookContributors = await db
        .selectFrom('bookContributor')
        .where('bookContributor.bookId', '=', book.id)
        .where('bookContributor.deletedAt', 'is', null)
        .select(['bookContributor.id'])
        .execute();
      expect(restoredBookContributors).toHaveLength(1);

      // Verify book series are restored
      const restoredBookSeries = await db
        .selectFrom('bookSeries')
        .where('bookSeries.bookId', '=', book.id)
        .where('bookSeries.deletedAt', 'is', null)
        .select(['bookSeries.id'])
        .execute();
      expect(restoredBookSeries).toHaveLength(1);

      // Verify chapters are restored
      const restoredChapters = await db
        .selectFrom('audiobookChapter')
        .where('audiobookChapter.bookId', '=', book.id)
        .where('audiobookChapter.deletedAt', 'is', null)
        .select(['audiobookChapter.id'])
        .execute();
      expect(restoredChapters).toHaveLength(2);

      // Verify contributor is restored
      const restoredContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', contributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredContributor.deletedAt).toBeNull();

      // Verify series is restored
      const restoredSeries = await db
        .selectFrom('series')
        .where('series.id', '=', series.id)
        .select(['series.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredSeries.deletedAt).toBeNull();
    });

    it('should return restored: false for non-existent book', async () => {
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

      const result = await Effect.runPromise(restoreDeletedBook({ bookId: 99999 }));

      expect(result.restored).toBe(false);
    });

    it('should return restored: false for book that is not deleted', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book.id }));

      expect(result.restored).toBe(false);
    });

    it('should handle book with no contributors or series', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

      const book = await db
        .insertInto('book')
        .values({ asin: 'ASIN123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Soft-delete the book
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book.id }));

      expect(result.restored).toBe(true);

      const restoredBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredBook.deletedAt).toBeNull();
    });
  });

  describe('restoreDeletedBookByAsin', () => {
    it('should restore a soft-deleted book by ASIN', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBookByAsin } = await import('./restoreDeletedBook');

      const book = await db
        .insertInto('book')
        .values({ asin: 'UNIQUE_ASIN_123', type: 'audio', title: 'Test Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Soft-delete the book
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      const result = await Effect.runPromise(restoreDeletedBookByAsin({ asin: 'UNIQUE_ASIN_123' }));

      expect(result.restored).toBe(true);
      expect(result.bookId).toBe(book.id);

      const restoredBook = await db
        .selectFrom('book')
        .where('book.id', '=', book.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredBook.deletedAt).toBeNull();
    });

    it('should return restored: false for non-existent ASIN', async () => {
      const { restoreDeletedBookByAsin } = await import('./restoreDeletedBook');

      const result = await Effect.runPromise(
        restoreDeletedBookByAsin({ asin: 'NONEXISTENT_ASIN' })
      );

      expect(result.restored).toBe(false);
      expect(result.bookId).toBeNull();
    });

    it('should return restored: false for book that is not deleted', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBookByAsin } = await import('./restoreDeletedBook');

      const book = await db
        .insertInto('book')
        .values({ asin: 'ACTIVE_ASIN', type: 'audio', title: 'Active Book', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const result = await Effect.runPromise(restoreDeletedBookByAsin({ asin: 'ACTIVE_ASIN' }));

      expect(result.restored).toBe(false);
      expect(result.bookId).toBe(book.id);
    });
  });

  describe('complex restoration scenarios', () => {
    it('should correctly restore a book that shares contributors with other books', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

      // Create a shared contributor
      const sharedContributor = await db
        .insertInto('contributor')
        .values({ asin: 'SHARED_CONTRIB', name: 'Shared Author' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      // Create two books that share the contributor
      const book1 = await db
        .insertInto('book')
        .values({ asin: 'ASIN1', type: 'audio', title: 'Book 1', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book2 = await db
        .insertInto('book')
        .values({ asin: 'ASIN2', type: 'audio', title: 'Book 2', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookContributor')
        .values([
          {
            bookId: book1.id,
            contributorId: sharedContributor.id,
            name: 'Shared Author',
            role: 'author',
          },
          {
            bookId: book2.id,
            contributorId: sharedContributor.id,
            name: 'Shared Author',
            role: 'author',
          },
        ])
        .execute();

      // Soft-delete book1 and its associated records
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book1.id)
        .execute();

      await db
        .updateTable('bookContributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookContributor.bookId', '=', book1.id)
        .execute();

      // Contributor is still active because book2 uses it

      // Restore book1
      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book1.id }));

      expect(result.restored).toBe(true);

      // Verify book1 is restored
      const restoredBook = await db
        .selectFrom('book')
        .where('book.id', '=', book1.id)
        .select(['book.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredBook.deletedAt).toBeNull();

      // Verify book1's book contributors are restored
      const restoredBookContributors = await db
        .selectFrom('bookContributor')
        .where('bookContributor.bookId', '=', book1.id)
        .where('bookContributor.deletedAt', 'is', null)
        .select(['bookContributor.id'])
        .execute();
      expect(restoredBookContributors).toHaveLength(1);

      // Verify shared contributor is still active
      const contributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', sharedContributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(contributor.deletedAt).toBeNull();
    });

    it('should restore book along with previously deleted contributor', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

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

      // Soft-delete everything
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book.id)
        .execute();

      await db
        .updateTable('bookContributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookContributor.bookId', '=', book.id)
        .execute();

      await db
        .updateTable('contributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('contributor.id', '=', contributor.id)
        .execute();

      // Restore the book
      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book.id }));

      expect(result.restored).toBe(true);

      // Verify contributor is also restored
      const restoredContributor = await db
        .selectFrom('contributor')
        .where('contributor.id', '=', contributor.id)
        .select(['contributor.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(restoredContributor.deletedAt).toBeNull();
    });

    it('should handle restoration of book in a series with multiple books', async () => {
      const { db } = await import('@/libs/db');
      const { restoreDeletedBook } = await import('./restoreDeletedBook');

      const series = await db
        .insertInto('series')
        .values({ asin: 'SERIES123', name: 'Test Series' })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book1 = await db
        .insertInto('book')
        .values({ asin: 'ASIN1', type: 'audio', title: 'Book 1', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const book2 = await db
        .insertInto('book')
        .values({ asin: 'ASIN2', type: 'audio', title: 'Book 2', adultsOnly: 0 })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookSeries')
        .values([
          { bookId: book1.id, seriesId: series.id, title: 'Test Series', label: 'Book 1', sort: 1 },
          { bookId: book2.id, seriesId: series.id, title: 'Test Series', label: 'Book 2', sort: 2 },
        ])
        .execute();

      // Soft-delete book1 and its series association
      await db
        .updateTable('book')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('book.id', '=', book1.id)
        .execute();

      await db
        .updateTable('bookSeries')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookSeries.bookId', '=', book1.id)
        .execute();

      // Restore book1
      const result = await Effect.runPromise(restoreDeletedBook({ bookId: book1.id }));

      expect(result.restored).toBe(true);

      // Verify book1's series association is restored
      const restoredBookSeries = await db
        .selectFrom('bookSeries')
        .where('bookSeries.bookId', '=', book1.id)
        .where('bookSeries.deletedAt', 'is', null)
        .select(['bookSeries.id'])
        .execute();
      expect(restoredBookSeries).toHaveLength(1);

      // Verify series is still active
      const activeSeries = await db
        .selectFrom('series')
        .where('series.id', '=', series.id)
        .select(['series.deletedAt'])
        .executeTakeFirstOrThrow();
      expect(activeSeries.deletedAt).toBeNull();
    });
  });
});
