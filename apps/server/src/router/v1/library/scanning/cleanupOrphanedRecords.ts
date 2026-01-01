import { Effect } from 'effect';

import { db, toEffect } from '@/libs/db';

/**
 * Soft-deletes books that have no active (non-deleted) audiobook files.
 * This should be called after cleanupAudiobookFile to ensure orphaned books
 * are cleaned up when their files are removed.
 */
export const cleanupOrphanedBooks = Effect.fn(function* () {
  const orphanedBooks = yield* toEffect(
    db
      .selectFrom('book')
      .leftJoin('audiobookFile', (join) =>
        join
          .onRef('audiobookFile.bookId', '=', 'book.id')
          .on('audiobookFile.deletedAt', 'is', null)
      )
      .where('book.deletedAt', 'is', null)
      .where('audiobookFile.id', 'is', null)
      .select(['book.id'])
      .execute()
  );

  if (orphanedBooks.length === 0) {
    return { deletedCount: 0 };
  }

  yield* toEffect(
    db
      .updateTable('book')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where(
        'book.id',
        'in',
        orphanedBooks.map((b) => b.id)
      )
      .execute()
  );

  yield* Effect.logInfo(`Soft-deleted ${orphanedBooks.length} orphaned books`);

  return { deletedCount: orphanedBooks.length };
});

/**
 * Soft-deletes contributors that have no active (non-deleted) book associations.
 * This should be called after cleanupOrphanedBooks to ensure orphaned contributors
 * are cleaned up when their books are removed.
 */
export const cleanupOrphanedContributors = Effect.fn(function* () {
  const orphanedContributors = yield* toEffect(
    db
      .selectFrom('contributor')
      .leftJoin('bookContributor', (join) =>
        join
          .onRef('bookContributor.contributorId', '=', 'contributor.id')
          .on('bookContributor.deletedAt', 'is', null)
      )
      .where('contributor.deletedAt', 'is', null)
      .where('bookContributor.id', 'is', null)
      .select(['contributor.id'])
      .execute()
  );

  if (orphanedContributors.length === 0) {
    return { deletedCount: 0 };
  }

  yield* toEffect(
    db
      .updateTable('contributor')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where(
        'contributor.id',
        'in',
        orphanedContributors.map((c) => c.id)
      )
      .execute()
  );

  yield* Effect.logInfo(`Soft-deleted ${orphanedContributors.length} orphaned contributors`);

  return { deletedCount: orphanedContributors.length };
});

/**
 * Soft-deletes series that have no active (non-deleted) book associations.
 * This should be called after cleanupOrphanedBooks to ensure orphaned series
 * are cleaned up when their books are removed.
 */
export const cleanupOrphanedSeries = Effect.fn(function* () {
  const orphanedSeries = yield* toEffect(
    db
      .selectFrom('series')
      .leftJoin('bookSeries', (join) =>
        join
          .onRef('bookSeries.seriesId', '=', 'series.id')
          .on('bookSeries.deletedAt', 'is', null)
      )
      .where('series.deletedAt', 'is', null)
      .where('bookSeries.id', 'is', null)
      .select(['series.id'])
      .execute()
  );

  if (orphanedSeries.length === 0) {
    return { deletedCount: 0 };
  }

  yield* toEffect(
    db
      .updateTable('series')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where(
        'series.id',
        'in',
        orphanedSeries.map((s) => s.id)
      )
      .execute()
  );

  yield* Effect.logInfo(`Soft-deleted ${orphanedSeries.length} orphaned series`);

  return { deletedCount: orphanedSeries.length };
});

/**
 * Soft-deletes audiobook chapters that belong to soft-deleted books or files.
 * This should be called after cleanupOrphanedBooks to ensure orphaned chapters
 * are cleaned up.
 */
export const cleanupOrphanedChapters = Effect.fn(function* () {
  // Clean up chapters from deleted books
  const chaptersFromDeletedBooks = yield* toEffect(
    db
      .selectFrom('audiobookChapter')
      .where('audiobookChapter.deletedAt', 'is', null)
      .where(
        'audiobookChapter.bookId',
        'in',
        db.selectFrom('book').where('book.deletedAt', 'is not', null).select('book.id')
      )
      .select(['audiobookChapter.id'])
      .execute()
  );

  if (chaptersFromDeletedBooks.length > 0) {
    yield* toEffect(
      db
        .updateTable('audiobookChapter')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where(
          'audiobookChapter.id',
          'in',
          chaptersFromDeletedBooks.map((c) => c.id)
        )
        .execute()
    );
  }

  // Clean up file-based chapters from deleted files
  const chaptersFromDeletedFiles = yield* toEffect(
    db
      .selectFrom('audiobookChapter')
      .where('audiobookChapter.deletedAt', 'is', null)
      .where('audiobookChapter.source', '=', 'file')
      .where('audiobookChapter.fileId', 'is not', null)
      .where(
        'audiobookChapter.fileId',
        'in',
        db
          .selectFrom('audiobookFile')
          .where('audiobookFile.deletedAt', 'is not', null)
          .select('audiobookFile.id')
      )
      .select(['audiobookChapter.id'])
      .execute()
  );

  if (chaptersFromDeletedFiles.length > 0) {
    yield* toEffect(
      db
        .updateTable('audiobookChapter')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where(
          'audiobookChapter.id',
          'in',
          chaptersFromDeletedFiles.map((c) => c.id)
        )
        .execute()
    );
  }

  const totalDeleted = chaptersFromDeletedBooks.length + chaptersFromDeletedFiles.length;

  if (totalDeleted > 0) {
    yield* Effect.logInfo(`Soft-deleted ${totalDeleted} orphaned chapters`);
  }

  return { deletedCount: totalDeleted };
});

/**
 * Soft-deletes book contributors for deleted books.
 */
export const cleanupOrphanedBookContributors = Effect.fn(function* () {
  const orphanedBookContributors = yield* toEffect(
    db
      .selectFrom('bookContributor')
      .where('bookContributor.deletedAt', 'is', null)
      .where(
        'bookContributor.bookId',
        'in',
        db.selectFrom('book').where('book.deletedAt', 'is not', null).select('book.id')
      )
      .select(['bookContributor.id'])
      .execute()
  );

  if (orphanedBookContributors.length === 0) {
    return { deletedCount: 0 };
  }

  yield* toEffect(
    db
      .updateTable('bookContributor')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where(
        'bookContributor.id',
        'in',
        orphanedBookContributors.map((c) => c.id)
      )
      .execute()
  );

  yield* Effect.logInfo(`Soft-deleted ${orphanedBookContributors.length} orphaned book contributors`);

  return { deletedCount: orphanedBookContributors.length };
});

/**
 * Soft-deletes book series for deleted books.
 */
export const cleanupOrphanedBookSeries = Effect.fn(function* () {
  const orphanedBookSeries = yield* toEffect(
    db
      .selectFrom('bookSeries')
      .where('bookSeries.deletedAt', 'is', null)
      .where(
        'bookSeries.bookId',
        'in',
        db.selectFrom('book').where('book.deletedAt', 'is not', null).select('book.id')
      )
      .select(['bookSeries.id'])
      .execute()
  );

  if (orphanedBookSeries.length === 0) {
    return { deletedCount: 0 };
  }

  yield* toEffect(
    db
      .updateTable('bookSeries')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where(
        'bookSeries.id',
        'in',
        orphanedBookSeries.map((s) => s.id)
      )
      .execute()
  );

  yield* Effect.logInfo(`Soft-deleted ${orphanedBookSeries.length} orphaned book series`);

  return { deletedCount: orphanedBookSeries.length };
});

/**
 * Runs all cleanup operations in the correct order:
 * 1. Books with no active files
 * 2. Book contributors for deleted books
 * 3. Book series for deleted books
 * 4. Chapters for deleted books/files
 * 5. Contributors with no active book associations
 * 6. Series with no active book associations
 */
export const cleanupAllOrphanedRecords = Effect.fn(function* () {
  const books = yield* cleanupOrphanedBooks().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned books').pipe(Effect.as({ deletedCount: 0 }))
    )
  );

  const bookContributors = yield* cleanupOrphanedBookContributors().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned book contributors').pipe(
        Effect.as({ deletedCount: 0 })
      )
    )
  );

  const bookSeries = yield* cleanupOrphanedBookSeries().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned book series').pipe(Effect.as({ deletedCount: 0 }))
    )
  );

  const chapters = yield* cleanupOrphanedChapters().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned chapters').pipe(Effect.as({ deletedCount: 0 }))
    )
  );

  const contributors = yield* cleanupOrphanedContributors().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned contributors').pipe(
        Effect.as({ deletedCount: 0 })
      )
    )
  );

  const series = yield* cleanupOrphanedSeries().pipe(
    Effect.catchAll(() =>
      Effect.logError('Error cleaning up orphaned series').pipe(Effect.as({ deletedCount: 0 }))
    )
  );

  return {
    books: books.deletedCount,
    bookContributors: bookContributors.deletedCount,
    bookSeries: bookSeries.deletedCount,
    chapters: chapters.deletedCount,
    contributors: contributors.deletedCount,
    series: series.deletedCount,
  };
});
