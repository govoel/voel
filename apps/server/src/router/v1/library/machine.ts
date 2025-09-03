import { Path } from '@effect/platform';
import {
  Chunk,
  Effect,
  Exit,
  GroupBy,
  Match,
  Option,
  ParseResult,
  Ref,
  Scope,
  Stream,
} from 'effect';
import { Actor, createActor, setup } from 'xstate';

import type { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import type { Hash } from '@/router/v1/library/hash';
import { gatherAuxiliaryAudiobookData } from '@/router/v1/library/identifying/gatherAuxiliaryAudiobookData';
import { identifyAudiobook } from '@/router/v1/library/identifying/identifyAudiobook';
import { insertAudiobook } from '@/router/v1/library/identifying/insertAudiobook';
import {
  cleanupAudiobookFile,
  cleanupUnidentifiedAudiobookFile,
} from '@/router/v1/library/scanning/cleanupAudiobookFile';
import { extractAudiobookFileMetadata } from '@/router/v1/library/scanning/extractAudiobookFileMetadata';
import { getLibraryDirents } from '@/router/v1/library/scanning/getLibraryDirents';
import { markAsUnidentified } from '@/router/v1/library/scanning/markAsUnidentified';
import { prepareAudiobookFile } from '@/router/v1/library/scanning/prepareAudiobookFile';

import { db, toEffect } from '@/libs/db';
import { AppRuntime } from '@/libs/effect/runtime';

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
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const fs = yield* FsExtended;
          const path = yield* Path.Path;

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
          yield* cleanupUnidentifiedAudiobookFile({ libraryId: context.id });

          const dir = yield* fs
            .opendir({
              path: context.path,
              options: {
                recursive: true,
              },
            })
            .pipe(
              Effect.tapError((error) =>
                Match.value(error).pipe(
                  Match.tagsExhaustive({
                    BadArgument: (error) =>
                      Effect.logError('Could not open directory').pipe(
                        Effect.annotateLogs('error', error.message)
                      ),
                    SystemError: (error) =>
                      Effect.logError('Could not open directory').pipe(
                        Effect.annotateLogs('error', error.message)
                      ),
                  })
                )
              ),
              Effect.option
            );

          if (Option.isNone(dir)) {
            return yield* Effect.void;
          }

          yield* Stream.fromChunk(yield* getLibraryDirents(dir.value)).pipe(
            Stream.mapEffect((e) =>
              prepareAudiobookFile(e).pipe(
                Effect.tapError((error) =>
                  Match.value(error).pipe(
                    Match.tagsExhaustive({
                      StatError: (error) =>
                        Effect.logError('Error getting file info, ignoring file').pipe(
                          Effect.annotateLogs('error', error.error.message)
                        ),
                      DirectoryError: () => Effect.logDebug('Ignoring directory'),
                      NoExtensionError: () => Effect.logDebug('Ignoring file without extension'),
                      UnsupportedExtensionError: (error) =>
                        Effect.logDebug('Ignoring unsupported extension').pipe(
                          Effect.annotateLogs('extension', error.extension)
                        ),
                      DbError: (error) =>
                        Effect.logError('Error fetching file from database, ignoring').pipe(
                          Effect.annotateLogs('error', error.error)
                        ),
                      UpToDateError: (error) =>
                        Effect.gen(function* () {
                          if (error.data.deletedAt) {
                            yield* toEffect(
                              db
                                .updateTable('audiobookFile')
                                .set({ deletedAt: null })
                                .where('audiobookFile.path', '=', path.join(e.parentPath, e.name))
                                .execute()
                            ).pipe(
                              Effect.tapBoth({
                                onFailure: () =>
                                  Effect.logError(
                                    'Database error while restoring up-to-date deleted file, ignoring file'
                                  ),
                                onSuccess: () => Effect.logInfo('Restored up-to-date deleted file'),
                              })
                            );
                          } else {
                            yield* Effect.logDebug('Ignoring up-to-date file');
                          }
                        }),
                      RealpathError: (error) =>
                        Effect.logDebug('Error resolving symbolic link, ignoring file').pipe(
                          Effect.annotateLogs('error', error.error.message)
                        ),
                    })
                  )
                ),
                Effect.map((result) => ({ ...result, path: path.join(e.parentPath, e.name) })),
                Effect.annotateLogs({ path: path.join(e.parentPath, e.name) }),
                Effect.option
              )
            ),
            Stream.filterMap((e) => e),
            Stream.mapEffect(
              (file) =>
                extractAudiobookFileMetadata({
                  file: {
                    metadataHashFromDb: file.metadataHashFromDb,
                    path: file.path,
                  },
                }).pipe(
                  Effect.map((result) => ({
                    ...result,
                    realPath: file.realPath,
                    mtimeMs: file.mtimeMs,
                    path: file.path,
                  })),
                  Effect.annotateLogs({ path: file.path }),
                  Effect.tapError((error) =>
                    Match.value(error).pipe(
                      Match.tagsExhaustive({
                        NoAlbumTitleOrArtistNameError: (error) =>
                          Effect.gen(function* () {
                            yield* Effect.logError(
                              'Missing album title or artist name, marking file as unidentified'
                            ).pipe(
                              Effect.annotateLogs({
                                albumTitle: error.data.albumTitle,
                                artistName: error.data.artistName,
                              })
                            );

                            yield* markAsUnidentified({
                              libraryId: context.id,
                              reason:
                                (error.data.albumTitle === undefined ||
                                  error.data.albumTitle.length === 0) &&
                                (error.data.artistName === undefined ||
                                  error.data.artistName.length === 0)
                                  ? 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME'
                                  : error.data.albumTitle === undefined ||
                                      error.data.albumTitle.length === 0
                                    ? 'METADATA_NO_ALBUM_TITLE'
                                    : 'METADATA_NO_ARTIST_NAME',
                              files: [
                                {
                                  path: file.path,
                                  discNumber: error.data.discNumber,
                                  trackNumber: error.data.trackNumber,
                                  mtimeMs: file.mtimeMs,
                                  metadataHash: error.data.metadataHash,
                                  metadata: error.data.metadata,
                                  normalizedTags: error.data.normalizedTags,
                                },
                              ],
                            }).pipe(
                              Effect.tapError(() =>
                                Effect.logError(
                                  'Failed to mark file as unidentified, ignoring file'
                                )
                              ),
                              Effect.catchAll(() => Effect.succeed(Option.none()))
                            );
                          }),
                        UpToDateError: () =>
                          Effect.gen(function* () {
                            if (file.deletedAt) {
                              yield* toEffect(
                                db
                                  .updateTable('audiobookFile')
                                  .set({ deletedAt: null })
                                  .where('audiobookFile.path', '=', file.path)
                                  .execute()
                              ).pipe(
                                Effect.tapBoth({
                                  onFailure: () =>
                                    Effect.logError(
                                      'Database error while restoring up-to-date deleted file, ignoring file'
                                    ),
                                  onSuccess: () =>
                                    Effect.logInfo('Restored up-to-date deleted file'),
                                })
                              );
                            } else {
                              yield* Effect.logDebug('File is up to date, ignoring file');
                            }
                          }),
                        FFProbeUnknownError: (error) =>
                          Effect.logError('Failed to extract metadata, ignoring file').pipe(
                            Effect.annotateLogs({
                              exitCode: error.exitCode,
                              stdout: error.stdout,
                            })
                          ),
                        FFProbeKnownError: (error) =>
                          Effect.logError('Failed to extract metadata, ignoring file').pipe(
                            Effect.annotateLogs({
                              exitCode: error.exitCode,
                              errorCode: error.errorCode,
                              message: error.message,
                            })
                          ),
                        BunShellSyntaxError: () =>
                          Effect.logError('Failed to parse metadata output, ignoring file'),
                        ParseError: (error) =>
                          Effect.logError(
                            'Extracted metadata was not in the expected format, ignoring file'
                          ).pipe(
                            Effect.annotateLogs(
                              'error',
                              ParseResult.TreeFormatter.formatErrorSync(error)
                            )
                          ),
                        UnknownException: (error) =>
                          Effect.logError(
                            'Unexpected error while extracting metadata, ignoring file'
                          ).pipe(Effect.annotateLogs('error', error.message)),
                      })
                    )
                  ),
                  Effect.option
                ),
              {
                concurrency: env.METADATA_EXTRACTION_BATCH_SIZE,
              }
            ),
            Stream.filterMap((e) => e),
            Stream.filterEffect((entry) =>
              Effect.gen(function* () {
                const dbFile = yield* toEffect(
                  db
                    .selectFrom('unidentifiedAudiobookFile')
                    .where('unidentifiedAudiobookFile.path', '=', entry.path)
                    .select([
                      'unidentifiedAudiobookFile.reason',
                      'unidentifiedAudiobookFile.metadataHash',
                      'unidentifiedAudiobookFile.deletedAt',
                    ])
                    .executeTakeFirst()
                ).pipe(
                  Effect.tapError(() =>
                    Effect.logError('Error while querying database for file, ignoring file').pipe(
                      Effect.andThen(() => Effect.succeed(false))
                    )
                  ),
                  Effect.option
                );

                if (
                  Option.isSome(dbFile) &&
                  dbFile.value &&
                  dbFile.value.reason === 'USER_DELETED_FROM_BOOK'
                ) {
                  if (dbFile.value.deletedAt !== null) {
                    yield* Effect.logDebug('Restoring user-deleted file as unidentified');
                    yield* toEffect(
                      db
                        .updateTable('unidentifiedAudiobookFile')
                        .set({ deletedAt: null })
                        .where('unidentifiedAudiobookFile.path', '=', entry.path)
                        .execute()
                    ).pipe(
                      Effect.catchAll(() =>
                        Effect.logError(
                          'Error while restoring file in database as unidentified, ignoring file'
                        ).pipe(Effect.andThen(() => Effect.succeed(false)))
                      )
                    );
                  }

                  // we only ignore user-deleted unidentified files if their metadata is
                  // up-to-date to ensure that the user deletion is respected as long as the
                  // file they deleted is the same
                  if (dbFile.value.metadataHash === entry.metadataHash) {
                    yield* Effect.logDebug(
                      "User-deleted unidentified file's metadata is up-to-date, ignoring file"
                    );
                    return yield* Effect.succeed(false);
                  }
                }

                return yield* Effect.succeed(true);
              }).pipe(Effect.annotateLogs('path', entry.path))
            ),
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
                        const book = yield* identifyAudiobook(e);

                        if (Option.isNone(book)) {
                          return {
                            identified: false,
                            reason: 'AUDIBLE_COULD_NOT_ID_BOOK',
                          } as const;
                        }

                        return {
                          identified: true,
                          ...(yield* gatherAuxiliaryAudiobookData(book.value)),
                        } as const;
                      }).pipe(Effect.annotateLogs('path', e.path)),
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
                if (!bookOption.identified) {
                  return yield* markAsUnidentified({
                    libraryId: context.id,
                    reason: bookOption.reason,
                    files: Chunk.toArray(files),
                  }).pipe(
                    Effect.catchAll(() =>
                      Effect.logError('Error while inserting unidentified files, ignoring files')
                    )
                  );
                }

                return yield* insertAudiobook({
                  ...bookOption,
                  libraryId: context.id,
                  files: Chunk.toArray(files),
                }).pipe(
                  Effect.catchTag('NoContributorsError', (error) => Effect.logError(error.message)),
                  Effect.catchTag('NoFilesError', (error) => Effect.logError(error.message)),
                  Effect.catchAll(() =>
                    Effect.logError('Error while inserting audiobook, ignoring audiobook')
                  )
                );
              }).pipe(
                Effect.annotateLogs('asin', bookOption.identified ? bookOption.book.asin : 'N/A')
              )
            ),
            Stream.runDrain
          ) satisfies Effect.Effect<
            void,
            never,
            Audible | FsExtended | Path.Path | Hash | Scope.Scope
          >;
        }).pipe(
          Effect.annotateLogs({ op: 'scan', library: context.name }),
          Effect.scoped
        ) satisfies Effect.Effect<void, never, Audible | FsExtended | Path.Path | Hash>
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
