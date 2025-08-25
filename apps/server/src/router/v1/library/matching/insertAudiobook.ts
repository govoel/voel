import { Path } from '@effect/platform';
import { Data, Effect, Exit, Schema } from 'effect';
import type { Insertable } from 'kysely';

import type { ProductBookSchema } from '@/router/v1/library/audible';
import {
  ChapterResponseSchema,
  ParentChapterSchema,
} from '@/router/v1/library/audible/getChaptersByAsin';
import type { FFProbeStdoutSchema } from '@/router/v1/library/fsExtended';

import { KnownSQLiteError, NotFoundError, QueryError, db, toEffect } from '@/libs/db';
import type {
  AudiobookChapterTable,
  BookSeriesTable,
  BookTable,
  ContributorTable,
  SeriesTable,
} from '@/libs/db/schema';

class NoContributorsError extends Data.TaggedError('NoContributorsError')<{
  message: string;
}> {}

class NoFilesError extends Data.TaggedError('NoFilesError')<{
  message: string;
}> {}

export const insertAudiobook = Effect.fn(
  function* ({
    libraryId,
    book,
    bookContributors,
    contributors,
    series,
    chapters,
    files,
  }: {
    libraryId: number;
    book: Insertable<BookTable>;
    bookContributors: (typeof ProductBookSchema.Type)['contributors'];
    contributors: Insertable<ContributorTable>[];
    series: {
      series: Insertable<SeriesTable>;
      bookSeries: Pick<Insertable<BookSeriesTable>, 'title' | 'label' | 'sort'>;
    }[];
    chapters: (typeof ChapterResponseSchema.Type)['content_metadata']['chapter_info']['chapters'];
    files: {
      parentPath: string;
      name: string;
      metadataHash: string;
      metadata: typeof FFProbeStdoutSchema.Type;
      mtimeMs: number;
      discNumber: number;
      trackNumber: number;
    }[];
  }) {
    const path = yield* Path.Path;

    if (bookContributors.length === 0) {
      return yield* Effect.fail(
        new NoContributorsError({
          message: 'No contributors for audiobook, when we expected at least one to be present',
        })
      );
    }

    if (files.length === 0) {
      return yield* Effect.fail(
        new NoFilesError({
          message: 'No files for audiobook, when we expected at least one to be present',
        })
      );
    }

    const trx = yield* toEffect(db.startTransaction().execute());

    yield* Effect.addFinalizer((exit) =>
      Exit.matchEffect(exit, {
        onFailure: () =>
          toEffect(trx.rollback().execute()).pipe(
            Effect.tapError(() => Effect.logError('Transaction rollback failed')),
            Effect.catchAll(() => Effect.void)
          ),
        onSuccess: () =>
          toEffect(trx.commit().execute()).pipe(
            Effect.tapError(() => Effect.logError('Transaction commit failed')),
            Effect.catchAll(() => Effect.void)
          ),
      })
    );

    const insertedBook = yield* toEffect(
      trx
        .insertInto('book')
        .values({
          asin: book.asin,
          type: book.type,
          otherTypeId: null,
          title: book.title,
          subtitle: book.subtitle,
          cover: book.cover?.replace(/\._S[A-Z]+500_\./, '.'),
          coverThumbhash: book.coverThumbhash,
          summary: book.summary,
          adultsOnly: book.adultsOnly,
        })
        .onConflict((oc) =>
          oc.doUpdateSet(({ ref }) => ({
            type: ref('excluded.type'),
            otherTypeId: ref('excluded.otherTypeId'),
            title: ref('excluded.title'),
            subtitle: ref('excluded.subtitle'),
            cover: ref('excluded.cover'),
            coverThumbhash: ref('excluded.coverThumbhash'),
            summary: ref('excluded.summary'),
            adultsOnly: ref('excluded.adultsOnly'),
            deletedAt: null,
          }))
        )
        .returning(['id as id'])
        .executeTakeFirstOrThrow()
    );

    const insertedContributors =
      contributors.length > 0
        ? yield* toEffect(
            trx
              .insertInto('contributor')
              .values(
                contributors.map((contributor) => ({
                  asin: contributor.asin,
                  name: contributor.name,
                  about: contributor.about,
                  avatar: contributor.avatar
                    ? contributor.avatar.replace(/\._S[A-Z]+500_\./, '.')
                    : null,
                  avatarThumbhash: contributor.avatarThumbhash,
                }))
              )
              .onConflict((oc) =>
                oc.doUpdateSet(({ ref }) => ({
                  name: ref('excluded.name'),
                  about: ref('excluded.about'),
                  avatar: ref('excluded.avatar'),
                  avatarThumbhash: ref('excluded.avatarThumbhash'),
                  deletedAt: null,
                }))
              )
              .returning(['id as id', 'asin as asin', 'name as name'])
              .execute()
          )
        : [];

    const insertedBookContributors = yield* toEffect(
      trx
        .insertInto('bookContributor')
        .values(
          bookContributors.map((bc) => ({
            bookId: insertedBook.id,
            contributorId: insertedContributors.find((ic) => ic.asin === bc.asin)?.id,
            name: insertedContributors.find((ic) => ic.asin === bc.asin)?.name ?? bc.name,
            role: bc.role,
          }))
        )
        .onConflict((oc) => oc.doUpdateSet({ deletedAt: null }))
        .returning(['id as id'])
        .execute()
    );

    yield* toEffect(
      trx
        .updateTable('bookContributor')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where('bookContributor.bookId', '=', insertedBook.id)
        .where(
          'bookContributor.id',
          'not in',
          insertedBookContributors.map((c) => c.id)
        )
        .execute()
    );

    let bookSeriesSoftDeleteQuery = trx
      .updateTable('bookSeries')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where('bookSeries.bookId', '=', insertedBook.id);

    if (series.length > 0) {
      const insertedSeries = yield* toEffect(
        trx
          .insertInto('series')
          .values(
            series.map(({ series }) => ({
              asin: series.asin,
              name: series.name,
              summary: series.summary,
            }))
          )
          .onConflict((oc) =>
            oc.doUpdateSet(({ ref }) => ({
              name: ref('excluded.name'),
              summary: ref('excluded.summary'),
              deletedAt: null,
            }))
          )
          .returning(['id', 'asin'])
          .execute()
      );

      const insertedBookSeries = yield* toEffect(
        trx
          .insertInto('bookSeries')
          .values(
            series.map(({ series, bookSeries }) => ({
              bookId: insertedBook.id,
              seriesId: insertedSeries.find((insertedSerie) => insertedSerie.asin === series.asin)!
                .id,
              title: bookSeries.title,
              label: bookSeries.label,
              sort: bookSeries.sort,
            }))
          )
          .onConflict((oc) => oc.doUpdateSet({ deletedAt: null }))
          .returning(['id as id'])
          .execute()
      );

      bookSeriesSoftDeleteQuery = bookSeriesSoftDeleteQuery.where(
        'bookSeries.id',
        'not in',
        insertedBookSeries.map((s) => s.id)
      );
    }

    yield* toEffect(bookSeriesSoftDeleteQuery.execute());

    // TODO: Either support multiple versions (file groups or something like
    // that) of the same book or detect and abort the transaction

    const insertedFiles = yield* toEffect(
      trx
        .insertInto('audiobookFile')
        .values(
          files.map((file) => ({
            libraryId,
            bookId: insertedBook.id,
            path: path.join(file.parentPath, file.name),
            durationMs: Math.round(file.metadata.format.duration * 1000),
            disc: file.discNumber,
            track: file.trackNumber,
            mtimeMs: file.mtimeMs,
            metadataHash: file.metadataHash,
          }))
        )
        .onConflict((oc) =>
          oc.doUpdateSet(({ ref }) => ({
            libraryId: ref('excluded.libraryId'),
            bookId: ref('excluded.bookId'),
            durationMs: ref('excluded.durationMs'),
            disc: ref('excluded.disc'),
            track: ref('excluded.track'),
            mtimeMs: ref('excluded.mtimeMs'),
            metadataHash: ref('excluded.metadataHash'),
            deletedAt: null,
          }))
        )
        .returning(['id as id', 'path as path'])
        .execute()
    );

    yield* toEffect(
      trx
        .updateTable('unmatchedAudiobookFile')
        .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
        .where((eb) =>
          eb.or(
            files.map((file) =>
              eb.and([
                eb('unmatchedAudiobookFile.parentPath', '=', file.parentPath),
                eb('unmatchedAudiobookFile.name', '=', file.name),
              ])
            )
          )
        )
        .execute()
    );

    // if source is file, startOffsetMs is relative to the fileId
    // if source is audible, startOffsetMs is absolute
    const fileChapters = files
      .map((file) =>
        file.metadata.chapters.map((chapter) => {
          const startTimeMs = chapter.start_time * 1000;
          const endTimeMs = chapter.end_time * 1000;
          return {
            bookId: insertedBook.id,
            parentId: null,
            fileId: insertedFiles.find(
              (insertedFile) => insertedFile.path === path.join(file.parentPath, file.name)
            )!.id,
            source: 'file' as const,
            title: chapter.tags.title,
            durationMs: Math.round(endTimeMs - startTimeMs),
            startOffsetMs: Math.round(startTimeMs),
          } satisfies Insertable<AudiobookChapterTable>;
        })
      )
      .flat();

    let insertedFileChapters: { id: number }[] = [];

    if (fileChapters.length > 0) {
      insertedFileChapters = yield* toEffect(
        trx
          .insertInto('audiobookChapter')
          .values(fileChapters)
          .onConflict((oc) =>
            oc.doUpdateSet(({ ref }) => ({
              parentId: ref('excluded.parentId'),
              deletedAt: null,
            }))
          )
          .returning(['id as id'])
          .execute()
      );
    }

    // insert files as chapters if the files didn't have chapters as metadata
    else {
      insertedFileChapters = yield* toEffect(
        trx
          .insertInto('audiobookChapter')
          .values(
            files.map((file) => ({
              bookId: insertedBook.id,
              parentId: null,
              fileId: insertedFiles.find(
                (insertedFile) => insertedFile.path === path.join(file.parentPath, file.name)
              )!.id,
              source: 'file' as const,
              title: file.metadata.format.tags.title || path.basename(file.name),
              durationMs: Math.round(file.metadata.format.duration * 1000),
              startOffsetMs: 0 as const,
            }))
          )
          .onConflict((oc) =>
            oc.doUpdateSet(({ ref }) => ({
              parentId: ref('excluded.parentId'),
              deletedAt: null,
            }))
          )
          .returning(['id as id'])
          .execute()
      );
    }

    let fileChaptersSoftDeleteQuery = trx
      .updateTable('audiobookChapter')
      .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
      .where('audiobookChapter.source', '=', 'file')
      .where(
        'audiobookChapter.fileId',
        'in',
        insertedFiles.map((file) => file.id)
      );

    if (insertedFileChapters.length > 0) {
      fileChaptersSoftDeleteQuery = fileChaptersSoftDeleteQuery.where(
        'audiobookChapter.id',
        'not in',
        insertedFileChapters.map((chapter) => chapter.id)
      );
    }

    yield* toEffect(fileChaptersSoftDeleteQuery.execute());

    if (chapters.length > 0) {
      const insertedAudibleChapterIds: number[] = [];

      const traverse = (
        chapter: (typeof chapters)[number],
        parentId: number | null
      ): Effect.Effect<void, KnownSQLiteError | NotFoundError | QueryError> =>
        Effect.gen(function* () {
          const insertedChapter = yield* toEffect(
            trx
              .insertInto('audiobookChapter')
              .values({
                bookId: insertedBook.id,
                parentId,
                fileId: null,
                source: 'audible' as const,
                title: chapter.title,
                durationMs: chapter.length_ms,
                startOffsetMs: chapter.start_offset_ms,
              })
              .onConflict((oc) =>
                oc.doUpdateSet(({ ref }) => ({
                  parentId: ref('excluded.parentId'),
                  deletedAt: null,
                }))
              )
              .returning('id')
              .executeTakeFirstOrThrow()
          );

          insertedAudibleChapterIds.push(insertedChapter.id);

          if (Schema.is(ParentChapterSchema)(chapter)) {
            yield* Effect.forEach(chapter.chapters, (childChapter) =>
              traverse(childChapter, insertedChapter.id)
            );
          }
        });

      yield* Effect.forEach(chapters, (chapter) => traverse(chapter, null));

      yield* toEffect(
        trx
          .updateTable('audiobookChapter')
          .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
          .where('audiobookChapter.source', '=', 'audible')
          .where('audiobookChapter.bookId', '=', insertedBook.id)
          .where('audiobookChapter.id', 'not in', insertedAudibleChapterIds)
          .execute()
      );
    }

    return { id: insertedBook.id };
  },
  (effect) => effect.pipe(Effect.scoped)
);
