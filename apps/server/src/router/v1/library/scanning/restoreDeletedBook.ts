import { Effect } from 'effect';

import { db, toEffect } from '@/libs/db';

/**
 * Restores a soft-deleted book and all its associated records (contributors, series, chapters)
 * when a file belonging to that book is detected during scanning.
 */
export const restoreDeletedBook = Effect.fn(function* ({ bookId }: { bookId: number }) {
  // First check if the book is actually deleted
  const book = yield* toEffect(
    db
      .selectFrom('book')
      .where('book.id', '=', bookId)
      .select(['book.id', 'book.deletedAt'])
      .executeTakeFirst()
  );

  if (!book) {
    yield* Effect.logDebug(`Book ${bookId} not found, skipping restoration`);
    return { restored: false };
  }

  if (book.deletedAt === null) {
    yield* Effect.logDebug(`Book ${bookId} is not deleted, skipping restoration`);
    return { restored: false };
  }

  // Restore the book
  yield* toEffect(
    db.updateTable('book').where('book.id', '=', bookId).set({ deletedAt: null }).execute()
  );

  // Restore book contributors
  yield* toEffect(
    db
      .updateTable('bookContributor')
      .where('bookContributor.bookId', '=', bookId)
      .set({ deletedAt: null })
      .execute()
  );

  // Restore book series
  yield* toEffect(
    db
      .updateTable('bookSeries')
      .where('bookSeries.bookId', '=', bookId)
      .set({ deletedAt: null })
      .execute()
  );

  // Restore audiobook chapters (both file-based and audible-based)
  yield* toEffect(
    db
      .updateTable('audiobookChapter')
      .where('audiobookChapter.bookId', '=', bookId)
      .set({ deletedAt: null })
      .execute()
  );

  // Get and restore associated contributors
  const contributorIds = yield* toEffect(
    db
      .selectFrom('bookContributor')
      .where('bookContributor.bookId', '=', bookId)
      .where('bookContributor.contributorId', 'is not', null)
      .select(['bookContributor.contributorId'])
      .execute()
  );

  if (contributorIds.length > 0) {
    yield* toEffect(
      db
        .updateTable('contributor')
        .where(
          'contributor.id',
          'in',
          contributorIds.map((c) => c.contributorId!)
        )
        .set({ deletedAt: null })
        .execute()
    );
  }

  // Get and restore associated series
  const seriesIds = yield* toEffect(
    db
      .selectFrom('bookSeries')
      .where('bookSeries.bookId', '=', bookId)
      .where('bookSeries.seriesId', 'is not', null)
      .select(['bookSeries.seriesId'])
      .execute()
  );

  if (seriesIds.length > 0) {
    yield* toEffect(
      db
        .updateTable('series')
        .where(
          'series.id',
          'in',
          seriesIds.map((s) => s.seriesId!)
        )
        .set({ deletedAt: null })
        .execute()
    );
  }

  yield* Effect.logInfo(`Restored book ${bookId} and its associated records`);

  return { restored: true };
});

/**
 * Restores a soft-deleted book by its ASIN. This is useful when we identify
 * a new file that matches an existing deleted book by ASIN.
 */
export const restoreDeletedBookByAsin = Effect.fn(function* ({ asin }: { asin: string }) {
  const book = yield* toEffect(
    db
      .selectFrom('book')
      .where('book.asin', '=', asin)
      .select(['book.id', 'book.deletedAt'])
      .executeTakeFirst()
  );

  if (!book) {
    yield* Effect.logDebug(`Book with ASIN ${asin} not found, skipping restoration`);
    return { restored: false, bookId: null };
  }

  if (book.deletedAt === null) {
    yield* Effect.logDebug(`Book with ASIN ${asin} is not deleted, skipping restoration`);
    return { restored: false, bookId: book.id };
  }

  yield* restoreDeletedBook({ bookId: book.id });

  return { restored: true, bookId: book.id };
});
