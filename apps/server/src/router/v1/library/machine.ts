import { Path } from '@effect/platform';
import { Chunk, Effect, Exit, GroupBy, Layer, Option, Ref, Schema, Stream } from 'effect';
import { type Insertable } from 'kysely';
import { Actor, createActor, setup } from 'xstate';

import { Audible } from '@/router/v1/library/audible';
import { ParentChapterSchema } from '@/router/v1/library/audible/getChaptersByAsin';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';
import { getContributors } from '@/router/v1/library/matching/getContributors';
import { getSeries } from '@/router/v1/library/matching/getSeries';
import { matchAudiobook } from '@/router/v1/library/matching/matchAudiobook';
import {
  cleanupAudiobookFile,
  cleanupUnmatchedAudiobookFile,
} from '@/router/v1/library/scanning/cleanupAudiobookFile';
import { extractAudiobookFileMetadata } from '@/router/v1/library/scanning/extractAudiobookFileMetadata';
import { markAsUnmatched } from '@/router/v1/library/scanning/markAsUnmatched';
import { prepareAudiobookFile } from '@/router/v1/library/scanning/prepareAudiobookFile';

import { KnownSQLiteError, NotFoundError, QueryError, db, toEffect } from '@/libs/db';
import { type AudiobookChapterTable } from '@/libs/db/schema';

import { env } from '@/env';

const libraryActors = new Map<number, Actor<typeof libraryMachine>>();

export const getLibraryActor = ({ id, name, path }: { id: number; name: string; path: string }) => {
  if (!libraryActors.has(id)) {
    libraryActors.set(id, createActor(libraryMachine, { input: { id, name, path } }).start());
  }
  return libraryActors.get(id)!;
};

export const removeLibraryActor = ({ id }: { id: number }) => {
  const actor = libraryActors.get(id);
  if (actor) {
    actor.stop();
    return libraryActors.delete(id);
  }
  return false;
};

export const makeConcurrencyProbe = (label: string) =>
  Effect.gen(function* () {
    const inFlight = yield* Ref.make(0);
    const maxSeen = yield* Ref.make(0);

    const start = Ref.updateAndGet(inFlight, (n) => n + 1).pipe(
      Effect.tap((n) => Ref.update(maxSeen, (m) => Math.max(m, n))),
      Effect.tap((n) => Effect.logDebug(`${label}: start -> inFlight=${n}`))
    );

    const end = Ref.updateAndGet(inFlight, (n) => n - 1).pipe(
      Effect.tap((n) => Effect.logDebug(`${label}: end   -> inFlight=${n}`))
    );

    const wrap = <A, E, R>(eff: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      Effect.acquireUseRelease(
        start,
        () => eff,
        () => end
      );

    const report = Effect.gen(function* () {
      const m = yield* Ref.get(maxSeen);
      yield* Effect.logInfo(`${label}: max concurrency observed = ${m}`);
      return m;
    });

    return { wrap, report } as const;
  });

const libraryMachine = setup({
  types: {
    context: {} as { id: number; name: string; path: string },
    input: {} as { id: number; name: string; path: string },
  },
  actions: {
    scanLibraryPath: async ({ context, self }) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FsExtended;
          const path = yield* Path.Path;
          const audible = yield* Audible;

          yield* Effect.logDebug('Scanning library');

          yield* Effect.addFinalizer((exit) =>
            Exit.matchEffect(exit, {
              onFailure: (error) =>
                Effect.logInfo('Error while scanning library').pipe(
                  Effect.annotateLogs('error', error)
                ),
              onSuccess: () => Effect.logInfo('Scan completed'),
            })
          );

          yield* cleanupAudiobookFile({ libraryId: context.id });
          yield* cleanupUnmatchedAudiobookFile({ libraryId: context.id });

          yield* Stream.fromAsyncIterable(
            yield* fs.opendir({
              path: context.path,
              options: {
                recursive: true,
              },
            }),
            (err) => new Error(String(err))
          ).pipe(
            Stream.mapEffect(prepareAudiobookFile),
            Stream.filterMap((e) => e),
            Stream.mapEffect(
              (file) => extractAudiobookFileMetadata({ libraryId: context.id, file }),
              {
                concurrency: env.METADATA_EXTRACTION_BATCH_SIZE,
              }
            ),
            Stream.filterMap((e) => e),
            Stream.broadcast(2, { capacity: env.METADATA_EXTRACTION_BATCH_SIZE }),
            Stream.flatMap(([first, second]) =>
              Stream.zip(
                first.pipe(
                  // TODO: Change from metadata-first matching to path-first matching
                  // note that this would need changes in `extractAudiobookFileMetadata`
                  // to put metadata found in path first so that metadata from path is at a
                  // higher priority than metadata from file
                  Stream.groupByKey((e) => `${e.albumTitle} by ${e.artistName}`),
                  GroupBy.evaluate((_, stream) =>
                    stream.pipe(
                      Stream.runHead,
                      Stream.map((e) => Option.getOrThrow(e))
                    )
                  ),
                  Stream.buffer({ capacity: env.MATCHER_BATCH_SIZE }),
                  Stream.mapEffect(
                    (e) =>
                      Effect.gen(function* () {
                        const book = yield* matchAudiobook(e);

                        if (Option.isNone(book)) {
                          return {
                            matched: false,
                            reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
                          } as const;
                        }

                        const contributors = yield* getContributors(book.value);

                        const seriesArr = yield* getSeries(book.value);

                        const chapters = yield* audible
                          .getChaptersByAsin({ asin: book.value.asin })
                          .pipe(
                            Effect.tapError(() =>
                              Effect.logWarning(
                                'Failed to fetch chapters for book, ignoring book'
                              ).pipe(
                                Effect.annotateLogs({
                                  bookAsin: book.value.asin,
                                })
                              )
                            ),
                            Effect.catchAll(() => Effect.succeed({ chapters: [] }))
                          );

                        const bookCoverThumbhash = yield* audible
                          .generateThumbhash({
                            imageURL: book.value.product_images[500].replace(
                              /\._S[A-Z]+500_\./,
                              '._SL100_.'
                            ),
                          })
                          .pipe(
                            Effect.tapError(() =>
                              Effect.logWarning('Failed to generate thumbhash for book cover').pipe(
                                Effect.annotateLogs({
                                  bookAsin: book.value.asin,
                                })
                              )
                            ),
                            Effect.option
                          );

                        const contributorAvatarThumbhashes = yield* Effect.forEach(
                          contributors,
                          (contributor) =>
                            contributor.avatar
                              ? audible
                                  .generateThumbhash({
                                    imageURL: contributor.avatar.replace(
                                      /\._S[A-Z]+500_\./,
                                      '._SL100_.'
                                    ),
                                  })
                                  .pipe(
                                    Effect.tapError(() =>
                                      Effect.logWarning(
                                        'Failed to generate thumbhash for contributor avatar'
                                      ).pipe(
                                        Effect.annotateLogs({
                                          bookAsin: book.value.asin,
                                          contributorAsin: contributor.asin,
                                        })
                                      )
                                    ),
                                    Effect.option
                                  )
                              : Effect.succeed(Option.none())
                        );

                        return {
                          matched: true as const,
                          book: {
                            asin: book.value.asin,
                            type: 'audio' as const,
                            title: book.value.title,
                            subtitle: book.value.subtitle,
                            cover: book.value.product_images[500],
                            coverThumbhash: Option.isSome(bookCoverThumbhash)
                              ? bookCoverThumbhash.value
                              : null,
                            summary: book.value.publisher_summary_md,
                            adultsOnly: book.value.is_adult_product ? (1 as const) : (0 as const),
                          },

                          bookContributors: book.value.contributors,

                          contributors: contributors.map((contributor, i) => ({
                            ...contributor,
                            avatarThumbhash: Option.isSome(contributorAvatarThumbhashes[i]!)
                              ? contributorAvatarThumbhashes[i].value
                              : null,
                          })),

                          series: seriesArr,

                          chapters: chapters.chapters,
                        };
                      }).pipe(Effect.annotateLogs('path', path.join(e.parentPath, e.name))),
                    {
                      concurrency: env.MATCHER_BATCH_SIZE,
                    }
                  )
                ),
                second.pipe(
                  // TODO: If possible, figure out early when we are done with a group
                  // instead of waiting for the entire stream to complete
                  Stream.groupByKey((e) => `${e.albumTitle} by ${e.artistName}`),
                  GroupBy.evaluate((_, stream) => stream.pipe(Stream.runCollect))
                )
              )
            ),
            Stream.mapEffect(([bookOption, files]) =>
              Effect.gen(function* () {
                if (!bookOption.matched) {
                  yield* markAsUnmatched({
                    libraryId: context.id,
                    reason: bookOption.reason,
                    files: Chunk.toArray(files),
                  });
                  return yield* Effect.void;
                }

                const { book, contributors, bookContributors, series, chapters } = bookOption;

                if (bookContributors.length === 0) {
                  yield* Effect.logError(
                    'No contributors for audiobook, when we expected at least one to be present'
                  );
                  return yield* Effect.void;
                }

                if (files.length === 0) {
                  yield* Effect.logError(
                    'No files for audiobook, when we expected at least one to be present'
                  );
                  return yield* Effect.void;
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
                      cover: book.cover.replace(/\._S[A-Z]+500_\./, '.'),
                      coverThumbhash: book.coverThumbhash,
                      summary: book.summary,
                      adultsOnly: book.adultsOnly,
                    })
                    .onConflict((oc) =>
                      oc.column('asin').doUpdateSet(({ fn, ref }) => ({
                        type: fn.coalesce(ref('excluded.type'), ref('book.type')),
                        otherTypeId: fn.coalesce(
                          ref('excluded.otherTypeId'),
                          ref('book.otherTypeId')
                        ),
                        title: fn.coalesce(ref('excluded.title'), ref('book.title')),
                        subtitle: fn.coalesce(ref('excluded.subtitle'), ref('book.subtitle')),
                        cover: fn.coalesce(ref('excluded.cover'), ref('book.cover')),
                        coverThumbhash: fn.coalesce(
                          ref('excluded.coverThumbhash'),
                          ref('book.coverThumbhash')
                        ),
                        summary: fn.coalesce(ref('excluded.summary'), ref('book.summary')),
                        adultsOnly: fn.coalesce(ref('excluded.adultsOnly'), ref('book.adultsOnly')),
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
                                : undefined,
                              avatarThumbhash: contributor.avatarThumbhash,
                            }))
                          )
                          .onConflict((oc) =>
                            oc.column('asin').doUpdateSet(({ fn, ref }) => ({
                              name: fn.coalesce(ref('excluded.name'), ref('contributor.name')),
                              about: fn.coalesce(ref('excluded.about'), ref('contributor.about')),
                              avatar: fn.coalesce(
                                ref('excluded.avatar'),
                                ref('contributor.avatar')
                              ),
                              avatarThumbhash: fn.coalesce(
                                ref('excluded.avatarThumbhash'),
                                ref('contributor.avatarThumbhash')
                              ),
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
                      bookContributors.map((contributor) => ({
                        bookId: insertedBook.id,
                        contributorId: insertedContributors.find(
                          (ic) => ic.asin === contributor.asin
                        )?.id,
                        name:
                          insertedContributors.find((ic) => ic.asin === contributor.asin)?.name ??
                          contributor.name,
                        role: contributor.role,
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
                        oc.column('asin').doUpdateSet(({ fn }) => ({
                          name: fn.coalesce('excluded.name', 'series.name'),
                          summary: fn.coalesce('excluded.summary', 'series.summary'),
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
                          seriesId: insertedSeries.find(
                            (insertedSerie) => insertedSerie.asin === series.asin
                          )!.id,
                          title: bookSeries.title,
                          label: bookSeries.label,
                          sort: bookSeries.sort,
                        }))
                      )
                      .onConflict((oc) =>
                        oc
                          .columns(['bookId', 'seriesId', 'title', 'label', 'sort'])
                          .doUpdateSet(({ fn, ref }) => ({
                            bookId: fn.coalesce(ref('excluded.bookId'), ref('bookSeries.bookId')),
                            seriesId: fn.coalesce(
                              ref('excluded.seriesId'),
                              ref('bookSeries.seriesId')
                            ),
                            title: fn.coalesce(ref('excluded.title'), ref('bookSeries.title')),
                            label: fn.coalesce(ref('excluded.label'), ref('bookSeries.label')),
                            sort: fn.coalesce(ref('excluded.sort'), ref('bookSeries.sort')),
                            deletedAt: null,
                          }))
                      )
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

                const filesArr = Chunk.toArray(files);

                const insertedFiles = yield* toEffect(
                  trx
                    .insertInto('audiobookFile')
                    .values(
                      filesArr.map((file) => ({
                        libraryId: context.id,
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
                      oc.column('path').doUpdateSet((eb) => ({
                        libraryId: eb.ref('excluded.libraryId'),
                        bookId: eb.ref('excluded.bookId'),
                        durationMs: eb.ref('excluded.durationMs'),
                        disc: eb.ref('excluded.disc'),
                        track: eb.ref('excluded.track'),
                        mtimeMs: eb.ref('excluded.mtimeMs'),
                        metadataHash: eb.ref('excluded.metadataHash'),
                        deletedAt: null,
                      }))
                    )
                    .returning(['id as id', 'path as path'])
                    .execute()
                );

                // if source is file, startOffsetMs is relative to the fileId
                // if source is audible, startOffsetMs is absolute
                const fileChapters = filesArr
                  .map((file) =>
                    file.metadata.chapters.map((chapter) => {
                      const startTimeMs = chapter.start_time * 1000;
                      const endTimeMs = chapter.end_time * 1000;
                      return {
                        bookId: insertedBook.id,
                        parentId: null,
                        fileId: insertedFiles.find(
                          (insertedFile) =>
                            insertedFile.path === path.join(file.parentPath, file.name)
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
                      .onConflict((oc) => oc.doUpdateSet({ deletedAt: null }))
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
                        filesArr.map((file) => ({
                          bookId: insertedBook.id,
                          parentId: null,
                          fileId: insertedFiles.find(
                            (insertedFile) =>
                              insertedFile.path === path.join(file.parentPath, file.name)
                          )!.id,
                          source: 'file' as const,
                          title: file.metadata.format.tags.title || path.basename(file.name),
                          durationMs: Math.round(file.metadata.format.duration * 1000),
                          startOffsetMs: 0 as const,
                        }))
                      )
                      .onConflict((oc) => oc.doUpdateSet({ deletedAt: null }))
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
                          .onConflict((oc) => oc.doUpdateSet({ deletedAt: null }))
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

                return yield* Effect.succeed(true);
              }).pipe(
                Effect.scoped,
                Effect.catchAll(() => Effect.logError('Error while inserting book, ignoring book')),
                Effect.annotateLogs('asin', bookOption.matched ? bookOption.book.asin : 'N/A')
              )
            ),
            Stream.runDrain,
            Effect.catchAll((error) =>
              Effect.logError('Error while scanning library').pipe(
                Effect.annotateLogs('error', error.message)
              )
            )
          );
        }).pipe(
          Effect.annotateLogs({ op: 'scan', library: context.name }),
          Effect.provide(
            Layer.merge(Audible.Default, FsExtended.Default).pipe(
              Layer.merge(Path.layer),
              Layer.merge(Hash.Default)
            )
          ),
          Effect.scoped
        )
      ).catch((e) => {
        console.log('Unexpected error while scanning library', e);
      });

      self.send({ type: 'scanComplete' });
    },
  },
}).createMachine({
  id: 'library',
  initial: 'idle',
  context: (opts) => opts.input,
  states: {
    idle: {
      on: {
        scan: { target: 'scanning' },
        scanComplete: { target: undefined },
      },
    },
    scanning: {
      entry: [{ type: 'scanLibraryPath' }],
      on: {
        scan: { target: undefined },
        scanComplete: { target: 'idle' },
      },
    },
  },
});
