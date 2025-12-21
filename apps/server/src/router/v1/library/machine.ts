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
import { sql } from 'kysely';
import { Actor, createActor, setup } from 'xstate';

import type { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';
import { gatherAuxiliaryAudiobookData } from '@/router/v1/library/identifying/gatherAuxiliaryAudiobookData';
import { identifyAudiobook } from '@/router/v1/library/identifying/identifyAudiobook';
import { insertAudiobook } from '@/router/v1/library/identifying/insertAudiobook';
import { cleanupAudiobookFile } from '@/router/v1/library/scanning/cleanupAudiobookFile';
import { deleteAudiobookFile } from '@/router/v1/library/scanning/deleteAudiobookFile';
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
      await AppRuntime.runPromise(libraryScanEffect(context)).catch((e) => {
        console.log('Unexpected error while scanning library', e);
      });

      self.send({ type: 'scanComplete' });
    },
    cleanupDatabase: async ({ context, self }) => {
      await AppRuntime.runPromise(libraryCleanupEffect(context)).catch((e) => {
        console.log('Unexpected error while cleaning library', e);
      });

      self.send({ type: 'cleanDbComplete' });
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
        cleanDb: { target: 'cleaning' },
        cleanDbComplete: { target: undefined },
      },
    },
    scanning: {
      entry: [{ type: 'scanLibraryPath' }],
      on: {
        scan: { target: undefined },
        scanComplete: { target: 'cleaning' },
        cleanDb: { target: undefined },
        cleanDbComplete: { target: undefined },
      },
    },
    cleaning: {
      entry: [{ type: 'cleanupDatabase' }],
      on: {
        scan: { target: undefined },
        scanComplete: { target: undefined },
        cleanDb: { target: undefined },
        cleanDbComplete: { target: 'idle' },
      },
    },
  },
});

export const libraryScanEffect = (context: { id: number; name: string; path: string }) =>
  Effect.gen(function* () {
    const fs = yield* FsExtended;
    const path = yield* Path.Path;

    yield* Effect.logDebug('Scanning library');

    yield* Effect.addFinalizer((exit) =>
      Exit.matchEffect(exit, {
        onFailure: (error) =>
          Effect.logInfo('Error while scanning library').pipe(Effect.annotateLogs('error', error)),
        onSuccess: () => Effect.logInfo('Scan completed'),
      })
    );

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

    const { ignoredDirs, files } = yield* getLibraryDirents(dir.value);

    yield* cleanupAudiobookFile({ libraryId: context.id, ignoredDirs });

    yield* Stream.fromChunk(files).pipe(
      Stream.mapEffect((file) =>
        prepareAudiobookFile(file).pipe(
          Effect.map((result) =>
            Option.some({ ...result, path: path.join(file.parentPath, file.name) })
          ),
          Effect.catchTags({
            StatError: (error) =>
              deleteAudiobookFile({
                path: path.join(file.parentPath, file.name),
              }).pipe(
                Effect.andThen(() =>
                  Effect.logError(
                    'Ignoring file since there was an error getting file info and deleting from database if it exists'
                  ).pipe(Effect.annotateLogs('error', error.error.message))
                ),
                Effect.catchTags({
                  DatabaseError: () =>
                    Effect.logError(
                      'Ignoring file since there was an error getting file info, and there was a database error when attempting to delete the file from the database'
                    ),
                }),
                Effect.as(Option.none())
              ),
            DirectoryError: () =>
              deleteAudiobookFile({
                path: path.join(file.parentPath, file.name),
              }).pipe(
                Effect.andThen(() =>
                  Effect.logDebug(
                    'Ignoring file since it is a directory and deleting from database if it exists'
                  )
                ),
                Effect.catchTags({
                  DatabaseError: () =>
                    Effect.logError(
                      'Ignoring file since it is a directory, and there was a database error when attempting to delete file from the database'
                    ),
                }),
                Effect.as(Option.none())
              ),
            NoExtensionError: () =>
              deleteAudiobookFile({
                path: path.join(file.parentPath, file.name),
              }).pipe(
                Effect.andThen(() =>
                  Effect.logDebug(
                    'Ignoring file since it has no extension and deleting from database if it exists'
                  )
                ),
                Effect.catchTags({
                  DatabaseError: () =>
                    Effect.logError(
                      'Ignoring file since it has no extension, and there was a database error when attempting to delete file from the database'
                    ),
                }),
                Effect.as(Option.none())
              ),
            UnsupportedExtensionError: (error) =>
              deleteAudiobookFile({
                path: path.join(file.parentPath, file.name),
              }).pipe(
                Effect.andThen(() =>
                  Effect.logDebug(
                    'Ignoring file with unsupported extension and deleting from database if it exists'
                  ).pipe(Effect.annotateLogs('extension', error.extension))
                ),
                Effect.catchTags({
                  DatabaseError: () =>
                    Effect.logError(
                      'Ignoring file with unsupported extension, and there was a database error when attempting to delete file from the database'
                    ),
                }),
                Effect.as(Option.none())
              ),
            RealpathError: (error) =>
              deleteAudiobookFile({
                path: path.join(file.parentPath, file.name),
              }).pipe(
                Effect.andThen(() =>
                  Effect.logDebug(
                    'Ignoring file since there was an error resolving symbolic link and deleting from database if it exists'
                  ).pipe(Effect.annotateLogs('error', error.error.message))
                ),
                Effect.catchTags({
                  DatabaseError: () =>
                    Effect.logError(
                      'Ignoring file since there was an error resolving symbolic link, and there was a database error when attempting to delete the file from the database'
                    ),
                }),
                Effect.as(Option.none())
              ),
          }),
          Effect.annotateLogs({ path: path.join(file.parentPath, file.name) })
        )
      ),
      Stream.filterMap((file) => file),
      // for identified files only, calculate filehash, and only if different, proceed with
      // metadata extraction
      // for unidentified files, we always proceed with metadata extraction in case the
      // metadata extractor/ffprobe has improved
      Stream.mapEffect(
        (file) =>
          Effect.gen(function* () {
            const dbFile = yield* toEffect(
              db
                .selectFrom('audiobookFile')
                .where('audiobookFile.path', '=', file.path)
                .select([
                  'audiobookFile.bookId',
                  'audiobookFile.mtimeMs',
                  'audiobookFile.partialFileHash',
                  'audiobookFile.deletedAt',
                ])
                .executeTakeFirstOrThrow()
            ).pipe(
              Effect.map((result) => Option.some(result)),
              Effect.catchTags({
                NotFoundError: () => Effect.succeed(Option.some(null)),
                QueryError: () =>
                  Effect.logError(
                    'Ignoring file since there was an error while querying database for file'
                  ).pipe(Effect.as(Option.none())),
                KnownSQLiteError: () =>
                  Effect.logError(
                    'Ignoring file since there was an error while querying database for file'
                  ).pipe(Effect.as(Option.none())),
              })
            );

            if (
              // file is identified and up-to-date, so ignore it
              Option.isSome(dbFile) &&
              dbFile.value !== null &&
              dbFile.value.bookId !== null &&
              dbFile.value.mtimeMs === file.mtimeMs
            ) {
              if (dbFile.value.deletedAt !== null) {
                yield* toEffect(
                  db
                    .updateTable('audiobookFile')
                    .where('audiobookFile.path', '=', file.path)
                    .set({ deletedAt: null })
                    .execute()
                ).pipe(
                  Effect.catchTags({
                    NotFoundError: () =>
                      Effect.logError(
                        'Ignoring file since there was a database error when attempting to restore up-to-date (via mtime) identified file'
                      ),
                    QueryError: () =>
                      Effect.logError(
                        'Ignoring file since there was a database error when attempting to restore up-to-date (via mtime) identified file'
                      ),
                    KnownSQLiteError: () =>
                      Effect.logError(
                        'Ignoring file since there was a database error when attempting to restore up-to-date (via mtime) identified file'
                      ),
                  })
                );

                // Also restore the book and all related entities if they were soft-deleted
                yield* restoreBookAndRelatedEntities(dbFile.value.bookId).pipe(
                  Effect.catchTags({
                    NotFoundError: () =>
                      Effect.logError(
                        'Error restoring book and related entities (via mtime match)'
                      ),
                    QueryError: () =>
                      Effect.logError(
                        'Error restoring book and related entities (via mtime match)'
                      ),
                    KnownSQLiteError: () =>
                      Effect.logError(
                        'Error restoring book and related entities (via mtime match)'
                      ),
                  })
                );

                yield* Effect.logDebug(
                  'Restored up-to-date (via mtime) identified file from deleted state and ignoring file'
                );
                return yield* Effect.succeed(Option.none());
              } else {
                yield* Effect.logDebug(
                  'File is already identified and up-to-date (via mtime), ignoring file'
                );
                return yield* Effect.succeed(Option.none());
              }
            }

            const fh = yield* fs.open(file.path, 'r').pipe(
              Effect.map((result) => Option.some(result)),
              Effect.catchAll(() =>
                Effect.if(Option.isSome(dbFile) && dbFile.value !== null, {
                  onTrue: () =>
                    deleteAudiobookFile({
                      path: file.path,
                    }).pipe(
                      Effect.andThen(() =>
                        Effect.logError(
                          'Ignoring file since there was an error while attempting to open the file, and deleting from database if it exists'
                        )
                      ),
                      Effect.catchTags({
                        DatabaseError: () =>
                          Effect.logError(
                            'Ignoring file since there was an error while attempting to open the file, and there was a database error when attempting to delete the file from the database'
                          ),
                      }),
                      Effect.as(Option.none())
                    ),
                  onFalse: () =>
                    Effect.logError(
                      'Ignoring file since there was an error while attempting to open the file'
                    ).pipe(Effect.as(Option.none())),
                })
              )
            );

            if (Option.isNone(fh)) {
              return yield* Effect.succeed(Option.none());
            }

            // partialFileHash is only needed for identified files, they are not needed
            // for unidentified files because unidentified files should always go through
            // the identification process again however, we still calculate it here
            const partialFileHash = yield* fs.partialHash(fh.value).pipe(
              Effect.map((result) => Option.some(result)),
              Effect.catchAll(() =>
                Effect.if(Option.isSome(dbFile) && dbFile.value !== null, {
                  onTrue: () =>
                    deleteAudiobookFile({
                      path: file.path,
                    }).pipe(
                      Effect.andThen(() =>
                        Effect.logError(
                          "Ignoring file since there was an error while attempting to calculate file's hash, and deleting from database if it exists"
                        )
                      ),
                      Effect.catchTags({
                        DatabaseError: () =>
                          Effect.logError(
                            "Ignoring file since there was an error while attempting to calculate file's hash, and there was a database error when attempting to delete the file from the database"
                          ),
                      }),
                      Effect.as(Option.none())
                    ),
                  onFalse: () =>
                    Effect.logError(
                      "Ignoring file since there was an error while attempting to calculate file's hash"
                    ).pipe(Effect.as(Option.none())),
                })
              )
            );

            if (Option.isNone(partialFileHash)) {
              return yield* Effect.succeed(Option.none());
            }

            if (
              // file is identified and up-to-date, so ignore it
              Option.isSome(dbFile) &&
              dbFile.value !== null &&
              dbFile.value.bookId !== null &&
              dbFile.value.partialFileHash === partialFileHash.value
            ) {
              yield* toEffect(
                db
                  .updateTable('audiobookFile')
                  .where('audiobookFile.path', '=', file.path)
                  .set({ deletedAt: null, mtimeMs: file.mtimeMs })
                  .execute()
              ).pipe(
                Effect.catchTags({
                  NotFoundError: () =>
                    Effect.logError(
                      "Ignoring file since there was a database error when attempting to update up-to-date (via hash) identified file's mtime"
                    ),
                  QueryError: () =>
                    Effect.logError(
                      "Ignoring file since there was a database error when attempting to update up-to-date (via hash) identified file's mtime"
                    ),
                  KnownSQLiteError: () =>
                    Effect.logError(
                      "Ignoring file since there was a database error when attempting to update up-to-date (via hash) identified file's mtime"
                    ),
                })
              );

              // Also restore the book and all related entities if they were soft-deleted
              yield* restoreBookAndRelatedEntities(dbFile.value.bookId).pipe(
                Effect.catchTags({
                  NotFoundError: () =>
                    Effect.logError('Error restoring book and related entities (via hash match)'),
                  QueryError: () =>
                    Effect.logError('Error restoring book and related entities (via hash match)'),
                  KnownSQLiteError: () =>
                    Effect.logError('Error restoring book and related entities (via hash match)'),
                })
              );

              yield* Effect.logDebug(
                'File is already identified and up-to-date (via hash), ignoring file'
              );
              return yield* Effect.succeed(Option.none());
            }

            const metadata = yield* extractAudiobookFileMetadata({ fileDescriptor: fh.value }).pipe(
              Effect.map((result) => Option.some(result)),
              Effect.catchTags({
                NoAlbumTitleOrArtistNameError: (error) =>
                  // mark as unidentified only if the DB's partialHash is NOT the same
                  // as the one we just calculated (no need to check here because just
                  // the fact that we're here means the partialFileHash does not match
                  // that of the db).
                  markAsUnidentified({
                    libraryId: context.id,
                    reason:
                      (error.data.albumTitle === undefined || error.data.albumTitle.length === 0) &&
                      (error.data.artistName === undefined || error.data.artistName.length === 0)
                        ? 'METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME'
                        : error.data.albumTitle === undefined || error.data.albumTitle.length === 0
                          ? 'METADATA_NO_ALBUM_TITLE'
                          : 'METADATA_NO_ARTIST_NAME',
                    files: [
                      {
                        path: file.path,
                        discNumber: error.data.discNumber,
                        trackNumber: error.data.trackNumber,
                        mtimeMs: file.mtimeMs,
                        metadata: error.data.metadata,
                      },
                    ],
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logDebug(
                        'Ignoring file and marking as unidentified since it is missing an album title or artist name'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since it is missing an album title or artist name, but there was a database error when attempting to mark the file as unidentified'
                        ),
                    }),
                    Effect.as(Option.none())
                  ),
                FFProbeUnknownError: (error) =>
                  deleteAudiobookFile({
                    path: file.path,
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logError(
                        'Ignoring file since there was an unknown ffprobe error while attempting to extract metadata, and deleting from database if it exists'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since there was an unknown ffprobe error while attempting to extract metadata, and there was a database error when attempting to delete the file from the database'
                        ),
                    }),
                    Effect.annotateLogs({
                      exitCode: error.exitCode,
                      stdout: error.stdout,
                    }),
                    Effect.as(Option.none())
                  ),
                FFProbeKnownError: (error) =>
                  deleteAudiobookFile({
                    path: file.path,
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logError(
                        'Ignoring file since there was a ffprobe error while attempting to extract metadata, and deleting from database if it exists'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since there was a ffprobe error while attempting to extract metadata, and there was a database error when attempting to delete the file from the database'
                        ),
                    }),
                    Effect.annotateLogs({
                      exitCode: error.exitCode,
                      errorCode: error.errorCode,
                      message: error.message,
                    }),
                    Effect.as(Option.none())
                  ),
                BunShellSyntaxError: () =>
                  deleteAudiobookFile({
                    path: file.path,
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logError(
                        'Ignoring file since there was a shell error while attempting to parse extracted metadata output, and deleting from database if it exists'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since there was a shell error while attempting to parse extracted metadata output, and there was a database error when attempting to delete the file from the database'
                        ),
                    }),
                    Effect.as(Option.none())
                  ),
                ParseError: (error) =>
                  deleteAudiobookFile({
                    path: file.path,
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logError(
                        'Ignoring file since the extracted metadata was not in the expected format, and deleting from database if it exists'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since the extracted metadata was not in the expected format, and there was a database error when attempting to delete the file from the database'
                        ),
                    }),
                    Effect.annotateLogs('error', ParseResult.TreeFormatter.formatErrorSync(error)),
                    Effect.as(Option.none())
                  ),
                UnknownException: (error) =>
                  deleteAudiobookFile({
                    path: file.path,
                  }).pipe(
                    Effect.andThen(() =>
                      Effect.logError(
                        'Ignoring file since there was an unexpected error while extracting metadata, and deleting from database if it exists'
                      )
                    ),
                    Effect.catchTags({
                      DatabaseError: () =>
                        Effect.logError(
                          'Ignoring file since there was an unexpected error while extracting metadata, and there was a database error when attempting to delete the file from the database'
                        ),
                    }),
                    Effect.annotateLogs('error', error.message),
                    Effect.as(Option.none())
                  ),
              })
            );

            if (Option.isNone(metadata)) {
              return yield* Effect.succeed(Option.none());
            }

            return yield* Effect.succeed(
              Option.some({
                ...metadata.value,
                realPath: file.realPath,
                mtimeMs: file.mtimeMs,
                path: file.path,
                partialFileHash: partialFileHash.value,
              })
            );
          }).pipe(Effect.annotateLogs('path', file.path), Effect.scoped),
        { concurrency: env.METADATA_EXTRACTION_BATCH_SIZE }
      ),
      Stream.filterMap((file) => file),
      Stream.broadcast(2, { capacity: env.METADATA_EXTRACTION_BATCH_SIZE }),
      Stream.flatMap(([first, second]) =>
        Stream.zip(
          first.pipe(
            Stream.groupByKey((file) => `${file.albumTitle} by ${file.artistName}`),
            GroupBy.evaluate((_, stream) =>
              stream.pipe(
                Stream.runHead,
                Stream.map((e) => Option.getOrThrow(e))
              )
            ),
            Stream.buffer({ capacity: env.MATCHER_BATCH_SIZE }),
            Stream.mapEffect(
              (file) =>
                Effect.gen(function* () {
                  const book = yield* identifyAudiobook(file);

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
                }).pipe(Effect.annotateLogs('path', file.path)),
              {
                concurrency: env.MATCHER_BATCH_SIZE,
              }
            )
          ),
          second.pipe(
            Stream.groupByKey((file) => `${file.albumTitle} by ${file.artistName}`),
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
              Effect.andThen(() => Effect.logDebug('Marked files as unidentified')),
              Effect.catchAll(() =>
                Effect.logError('Database error while inserting unidentified files, ignoring files')
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
        }).pipe(Effect.annotateLogs('asin', bookOption.identified ? bookOption.book.asin : 'N/A'))
      ),
      Stream.runDrain
    ) satisfies Effect.Effect<void, never, Audible | FsExtended | Path.Path | Hash | Scope.Scope>;

    // TODO: cleanup deleted books
  }).pipe(
    Effect.annotateLogs({ op: 'scan', library: context.name }),
    Effect.scoped
  ) satisfies Effect.Effect<void, never, Audible | FsExtended | Path.Path | Hash>;

/**
 * Restores a soft-deleted book and all its related entities.
 * This is used when a file that belongs to a previously deleted book is found during scanning.
 *
 * Restores in this order:
 * 1. The book itself
 * 2. Book-contributor associations for the book
 * 3. Book-series associations for the book
 * 4. Chapters for the book
 * 5. Contributors linked via bookContributor
 * 6. Series linked via bookSeries
 * 7. Playback history for the book
 */
const restoreBookAndRelatedEntities = (bookId: number) =>
  Effect.gen(function* () {
    // Restore the book
    yield* toEffect(
      db.updateTable('book').set({ deletedAt: null }).where('id', '=', bookId).execute()
    );

    // Restore book-contributor associations
    yield* toEffect(
      db
        .updateTable('bookContributor')
        .set({ deletedAt: null })
        .where('bookId', '=', bookId)
        .execute()
    );

    // Restore book-series associations
    yield* toEffect(
      db.updateTable('bookSeries').set({ deletedAt: null }).where('bookId', '=', bookId).execute()
    );

    // Restore chapters for the book
    yield* toEffect(
      db
        .updateTable('audiobookChapter')
        .set({ deletedAt: null })
        .where('bookId', '=', bookId)
        .execute()
    );

    // Restore contributors linked to this book via bookContributor
    yield* toEffect(
      db
        .updateTable('contributor')
        .set({ deletedAt: null })
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom('bookContributor')
              .whereRef('bookContributor.contributorId', '=', 'contributor.id')
              .where('bookContributor.bookId', '=', bookId)
              .select('bookContributor.id')
          )
        )
        .execute()
    );

    // Restore series linked to this book via bookSeries
    yield* toEffect(
      db
        .updateTable('series')
        .set({ deletedAt: null })
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom('bookSeries')
              .whereRef('bookSeries.seriesId', '=', 'series.id')
              .where('bookSeries.bookId', '=', bookId)
              .select('bookSeries.id')
          )
        )
        .execute()
    );

    // Restore playback history for the book
    // Note: Using sql`null` because the schema type for playbackHistory.deletedAt
    // doesn't allow null in updates (it's ColumnType<number | null, never, number>)
    yield* toEffect(
      db
        .updateTable('playbackHistory')
        .set({ deletedAt: sql<number>`null` })
        .where('bookId', '=', bookId)
        .execute()
    );

    yield* Effect.logDebug(`Restored book ${bookId} and all related entities`);
  });

/**
 * Cleans up all orphaned database records in a single query using CTEs.
 * This soft-deletes:
 * 1. Orphaned books (audio books with no files)
 * 2. Orphaned chapters (chapters for deleted books)
 * 3. Orphaned book-contributor associations (for deleted books)
 * 4. Orphaned book-series associations (for deleted books)
 * 5. Orphaned contributors (not linked to any active book)
 * 6. Orphaned series (not linked to any active book)
 * 7. Orphaned playback history (for deleted books)
 *
 * The CTEs ensure proper ordering: books are marked deleted first, then dependent
 * records are cleaned up based on the updated book.deletedAt values.
 */
export const libraryCleanupEffect = (context: { id: number; name: string; path: string }) =>
  Effect.gen(function* () {
    yield* Effect.logDebug('Cleaning up orphaned database records');

    const now = sql<number>`(unixepoch())`;

    yield* toEffect(
      db
        // 1. Soft-delete orphaned books (audio books with no active files)
        .with('orphaned_books', (qc) =>
          qc
            .updateTable('book')
            .set({ deletedAt: now })
            .where('type', '=', 'audio')
            .where('deletedAt', 'is', null)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('audiobookFile')
                    .whereRef('audiobookFile.bookId', '=', 'book.id')
                    .where('audiobookFile.deletedAt', 'is', null)
                    .select('audiobookFile.id')
                )
              )
            )
            .returning('id')
        )
        // 2. Soft-delete orphaned chapters (chapters for deleted books)
        .with('orphaned_chapters', (qc) =>
          qc
            .updateTable('audiobookChapter')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ exists, selectFrom }) =>
              exists(
                selectFrom('book')
                  .whereRef('book.id', '=', 'audiobookChapter.bookId')
                  .where('book.deletedAt', 'is not', null)
                  .select('book.id')
              )
            )
            .returning('id')
        )
        // 3. Soft-delete orphaned book-contributor associations (for deleted books)
        .with('orphaned_book_contributors', (qc) =>
          qc
            .updateTable('bookContributor')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ exists, selectFrom }) =>
              exists(
                selectFrom('book')
                  .whereRef('book.id', '=', 'bookContributor.bookId')
                  .where('book.deletedAt', 'is not', null)
                  .select('book.id')
              )
            )
            .returning('id')
        )
        // 4. Soft-delete orphaned book-series associations (for deleted books)
        .with('orphaned_book_series', (qc) =>
          qc
            .updateTable('bookSeries')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ exists, selectFrom }) =>
              exists(
                selectFrom('book')
                  .whereRef('book.id', '=', 'bookSeries.bookId')
                  .where('book.deletedAt', 'is not', null)
                  .select('book.id')
              )
            )
            .returning('id')
        )
        // 5. Soft-delete orphaned contributors (not linked to any active book)
        .with('orphaned_contributors', (qc) =>
          qc
            .updateTable('contributor')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('bookContributor')
                    .whereRef('bookContributor.contributorId', '=', 'contributor.id')
                    .where('bookContributor.deletedAt', 'is', null)
                    .select('bookContributor.id')
                )
              )
            )
            .returning('id')
        )
        // 6. Soft-delete orphaned series (not linked to any active book)
        .with('orphaned_series', (qc) =>
          qc
            .updateTable('series')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ not, exists, selectFrom }) =>
              not(
                exists(
                  selectFrom('bookSeries')
                    .whereRef('bookSeries.seriesId', '=', 'series.id')
                    .where('bookSeries.deletedAt', 'is', null)
                    .select('bookSeries.id')
                )
              )
            )
            .returning('id')
        )
        // 7. Soft-delete orphaned playback history (for deleted books)
        .with('orphaned_playback_history', (qc) =>
          qc
            .updateTable('playbackHistory')
            .set({ deletedAt: now })
            .where('deletedAt', 'is', null)
            .where(({ exists, selectFrom }) =>
              exists(
                selectFrom('book')
                  .whereRef('book.id', '=', 'playbackHistory.bookId')
                  .where('book.deletedAt', 'is not', null)
                  .select('book.id')
              )
            )
            .returning('id')
        )
        // Final SELECT to execute all CTEs
        .selectNoFrom((eb) => [eb.fn.countAll<number>().as('total')])
        .execute()
    ).pipe(
      Effect.catchAll((error) =>
        Effect.logError('Error while cleaning up orphaned records').pipe(
          Effect.annotateLogs('error', String(error))
        )
      )
    );

    yield* Effect.logInfo('Database cleanup completed');
  }).pipe(Effect.annotateLogs({ op: 'cleanup', library: context.name }));
