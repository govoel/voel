import { FsExtended } from './fsExtended';
import { Hash } from './hash';
import { gatherAuxiliaryAudiobookData } from './identifying/gatherAuxiliaryAudiobookData';
import { insertAudiobook } from './identifying/insertAudiobook';
import { extractAudiobookFileMetadata } from './scanning/extractAudiobookFileMetadata';
import { markAsUnidentified } from './scanning/markAsUnidentified';
import { prepareAudiobookFile } from './scanning/prepareAudiobookFile';
import { Path } from '@effect/platform';
import { TRPCError } from '@trpc/server';
import { schemas } from '@voel/schemas';
import { Effect, Either, Match, Option, Schema } from 'effect';
import { NoResultError } from 'kysely';
import * as path from 'node:path';

import { Audible, ProductBookSchema } from '@/router/v1/library/audible';
import { getLibraryActor } from '@/router/v1/library/machine';

import { db, isSQLiteError } from '@/libs/db';
import { AppRuntime } from '@/libs/effect/runtime';

import { adminProcedure, createTRPCRouter } from '@/trpc';

export const libraryRouter = createTRPCRouter({
  create: adminProcedure.input(schemas.v1.library.create).mutation(async ({ input }) => {
    const library = await db
      .insertInto('library')
      .values({ name: input.name, path: input.path })
      .returning([
        'id as id',
        'name as name',
        'path as path',
        'createdAt as createdAt',
        'updatedAt as updatedAt',
        'deletedAt as deletedAt',
      ])
      .executeTakeFirstOrThrow()
      .catch((err: Error) => {
        if (isSQLiteError(err) && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A library with this name already exists.',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `An error occurred while creating the library: ${err.message}. Please try again later.`,
        });
      });

    return library;
  }),

  scan: adminProcedure.input(schemas.v1.library.scan).mutation(async ({ input }) => {
    const library = await db
      .selectFrom('library')
      .where('id', '=', input.id)
      .select(['id', 'name', 'path'])
      .executeTakeFirstOrThrow()
      .catch((err) => {
        if (err instanceof NoResultError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Library with ID ${input.id} could not be found.`,
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `An error occurred while scanning the library: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
        });
      });

    try {
      const actor = getLibraryActor({ id: library.id, name: library.name, path: library.path });

      if (actor.getSnapshot().can({ type: 'scan' })) {
        actor.send({ type: 'scan' });
        return {
          message: 'Library scan has been queued.',
        };
      } else {
        return {
          message: 'A library scanning is already in progress.',
        };
      }
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `An error occurred while scanning the library: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
      });
    }
  }),

  unidentified: createTRPCRouter({
    getFiles: adminProcedure
      .input(schemas.v1.library.unidentified.getFiles)
      .query(async ({ input }) => {
        const results = await db
          .selectFrom('unidentifiedAudiobookFile')
          .where('libraryId', '=', input.id)
          .where('deletedAt', 'is', null)
          .select(['path', 'durationMs', 'disc', 'track', 'reason', 'metadata'])
          .execute();

        return results.map((result) => ({
          directory: path.dirname(result.path),
          name: path.basename(result.path),
          durationMs: result.durationMs,
          disc: result.disc,
          track: result.track,
          reason: result.reason,
          metadata: JSON.parse(result.metadata) as Record<string, string | undefined>,
        }));
      }),

    search: adminProcedure
      .input(schemas.v1.library.unidentified.search)
      .mutation(async ({ input: { asin, title, author } }) => {
        if (asin || title || author) {
          const result = await AppRuntime.runPromise(
            searchProgram({ asin, title, author }).pipe(Effect.either)
          );

          if (Either.isRight(result)) {
            return result.right;
          } else {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.left.message,
            });
          }
        }

        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid search parameters' });
      }),

    identify: adminProcedure
      .input(schemas.v1.library.unidentified.identify)
      .mutation(async ({ input }) => {
        const result = await AppRuntime.runPromise(
          Effect.gen(function* () {
            const fs = yield* FsExtended;
            const path = yield* Path.Path;
            const fileStats = yield* Effect.forEach(input.files, (file) =>
              fs.lstat(path.join(file.directory, file.name)).pipe(
                Effect.catchTags({
                  BadArgument: () =>
                    Effect.fail({
                      message: 'Error getting info for file',
                      description: path.join(file.directory, file.name),
                    } as const),
                  SystemError: () =>
                    Effect.fail({
                      message: 'Error getting info for file',
                      description: path.join(file.directory, file.name),
                    } as const),
                }),
                Effect.map((stat) => ({
                  parentPath: file.directory,
                  name: file.name,
                  isDirectory: stat.isDirectory,
                  isSymbolicLink: stat.isSymbolicLink,
                }))
              )
            );

            const files = yield* Effect.forEach(fileStats, (file) =>
              prepareAudiobookFile({
                parentPath: file.parentPath,
                name: file.name,
                isDirectory: file.isDirectory,
                isSymbolicLink: file.isSymbolicLink,
              }).pipe(
                Effect.catchTags({
                  StatError: (error) =>
                    Effect.fail({
                      message: 'Error getting info for file',
                      description: error.message,
                    } as const),
                  DirectoryError: () =>
                    Effect.fail({
                      message: 'Cannot use directories in identifications',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  NoExtensionError: () =>
                    Effect.fail({
                      message: "File doesn't have an extension",
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  UnsupportedExtensionError: () =>
                    Effect.fail({
                      message: "File doesn't have an extension that is supported by this library",
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  DbError: () =>
                    Effect.fail({
                      message: 'Error getting file from database',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  // TODO: write a test for these cases! we don't care if the file is part of a book already,
                  // we are re-identifying it. we also don't care if the file is deleted and considered
                  // to be up-to-date in the identified files table, we are *always* extracting metadata
                  UpToDateError: (error) => Effect.succeed(error.data),
                  // TODO: write a test for this case! we don't care if the file is a symlink or not,
                  // since the realPath is only used during automatic file identification when scanning
                  RealpathError: (error) => Effect.succeed(error.data),
                }),
                Effect.map((data) => ({ ...data, path: path.join(file.parentPath, file.name) }))
              )
            );

            const fileMetadata = yield* Effect.forEach(files, (file) =>
              extractAudiobookFileMetadata({
                file: {
                  metadataHashFromDb: file.metadataHashFromDb,
                  path: file.path,
                },
              }).pipe(
                Effect.catchTags({
                  // TODO: write a test for this case! we want the file's metadata,
                  // even if it doesn't have album title or artist name
                  NoAlbumTitleOrArtistNameError: (error) => Effect.succeed(error.data),
                  // TODO: write a test for this case! we want the file's metadata,
                  // even if the file is considered up-to-date
                  UpToDateError: (error) => Effect.succeed(error.data),
                  FFProbeKnownError: () =>
                    Effect.fail({
                      message: 'Error while extracting metadata for file',
                      description: file.path,
                    } as const),
                  FFProbeUnknownError: () =>
                    Effect.fail({
                      message: 'Unknown error while extracting metadata for file',
                      description: file.path,
                    } as const),
                  BunShellSyntaxError: () =>
                    Effect.fail({
                      message: 'Failed to parse metadata output for file',
                      description: file.path,
                    } as const),
                  ParseError: () =>
                    Effect.fail({
                      message: 'Extracted metadata was not in the expected format for file',
                      description: file.path,
                    } as const),
                  UnknownException: () =>
                    Effect.fail({
                      message: 'Unknown error while extracting metadata for file',
                      description: file.path,
                    } as const),
                }),
                Effect.map((result) => ({
                  ...result,
                  path: file.path,
                  mtimeMs: file.mtimeMs,
                }))
              )
            );

            const audible = yield* Audible;
            const product = yield* audible.getProductByAsin({ asin: input.asin }).pipe(
              Effect.catchTags({
                ParseError: () =>
                  Effect.fail({
                    message: 'Error while parsing response for full book data',
                  } as const),
                RequestError: () =>
                  Effect.fail({
                    message: 'Error while fetching full book data',
                  } as const),
                ResponseError: () =>
                  Effect.fail({
                    message: 'Error while processing response for full book data',
                  } as const),
              })
            );

            if (!Schema.is(ProductBookSchema)(product)) {
              return yield* Effect.fail({
                message: 'The provided ASIN was not for a book',
              } as const);
            }

            const book = yield* gatherAuxiliaryAudiobookData(product);

            return yield* insertAudiobook({
              ...book,
              libraryId: input.libraryId,
              files: fileMetadata,
            }).pipe(
              Effect.catchTags({
                NoContributorsError: (error) => Effect.fail({ message: error.message } as const),
                NoFilesError: (error) => Effect.fail({ message: error.message } as const),
              }),
              Effect.catchAll(() =>
                Effect.fail({
                  message: 'Unknown error while inserting audiobook',
                } as const)
              )
            );
          }).pipe(Effect.either) satisfies Effect.Effect<
            Either.Either<{ id: number }, { message: string; description?: string }>,
            never,
            Audible | Path.Path | FsExtended | Hash
          >
        );

        if (Either.isRight(result)) {
          return { id: result.right.id };
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.left.message,
            cause: {
              description: 'description' in result.left ? result.left.description : undefined,
            },
          });
        }
      }),
  }),

  book: createTRPCRouter({
    editFiles: adminProcedure
      .input(schemas.v1.library.book.editFiles)
      .mutation(async ({ input }) => {
        const deletedFiles = await db.transaction().execute(async (trx) => {
          for (const file of input.files) {
            await trx
              .updateTable('audiobookFile')
              .set({ customOrder: file.customOrder, bookId: input.bookId })
              .where('id', '=', file.id)
              .execute();
          }

          const deletedFiles = await trx
            .updateTable('audiobookFile')
            .set((eb) => ({ deletedAt: eb.fn('unixepoch') }))
            .where('audiobookFile.bookId', '=', input.bookId)
            .where(
              'audiobookFile.id',
              'not in',
              input.files.map((file) => file.id)
            )
            .returning([
              'audiobookFile.libraryId',
              'audiobookFile.path',
              'audiobookFile.mtimeMs',
              'audiobookFile.metadataHash',
              'audiobookFile.durationMs',
              'audiobookFile.disc',
              'audiobookFile.track',
            ])
            .execute();

          if (deletedFiles.length > 0) {
            await trx
              .insertInto('unidentifiedAudiobookFile')
              .values(
                deletedFiles.map((deletedFile) => ({
                  libraryId: deletedFile.libraryId,
                  path: deletedFile.path,
                  mtimeMs: deletedFile.mtimeMs,
                  metadataHash: deletedFile.metadataHash,
                  durationMs: deletedFile.durationMs,
                  disc: deletedFile.disc,
                  track: deletedFile.track,
                  reason: 'USER_DELETED_FROM_BOOK' as const,
                  metadata: '{}',
                }))
              )
              .onConflict((oc) =>
                oc.doUpdateSet((eb) => ({
                  libraryId: eb.ref('excluded.libraryId'),
                  durationMs: eb.ref('excluded.durationMs'),
                  disc: eb.ref('excluded.disc'),
                  track: eb.ref('excluded.track'),
                  reason: eb.ref('excluded.reason'),
                  // because if there is a row already, better to have metadata with
                  // something in it than {}. consequently, we don't update metadataHash
                  // or mtimeMs since that should accurately reflect the current contents
                  // of the metadata column
                  mtimeMs: eb.ref('unidentifiedAudiobookFile.mtimeMs'),
                  metadataHash: eb.ref('unidentifiedAudiobookFile.metadataHash'),
                  metadata: eb.ref('unidentifiedAudiobookFile.metadata'),
                  deletedAt: null,
                }))
              )
              .execute();
          }

          return deletedFiles;
        });

        if (deletedFiles.length > 0) {
          const fileErrors: { path?: string; message: string }[] = [];
          await AppRuntime.runPromise(
            Effect.gen(function* () {
              const fs = yield* FsExtended;
              const path = yield* Path.Path;
              const fileStats = (yield* Effect.forEach(deletedFiles, (file) =>
                fs.lstat(file.path).pipe(
                  Effect.tapError((error) =>
                    Match.value(error).pipe(
                      Match.tagsExhaustive({
                        BadArgument: () =>
                          Effect.sync(() =>
                            fileErrors.push({ path: file.path, message: "couldn't get file info" })
                          ),
                        SystemError: () =>
                          Effect.sync(() =>
                            fileErrors.push({ path: file.path, message: "couldn't get file info" })
                          ),
                      })
                    )
                  ),
                  Effect.map((stat) => ({
                    parentPath: path.dirname(file.path),
                    name: path.basename(file.path),
                    path: file.path,
                    isDirectory: stat.isDirectory,
                    isSymbolicLink: stat.isSymbolicLink,
                  })),
                  Effect.option
                )
              ))
                .filter((i) => Option.isSome(i))
                .map((i) => i.value);

              const files = (yield* Effect.forEach(fileStats, (file) =>
                prepareAudiobookFile({
                  parentPath: file.parentPath,
                  name: file.name,
                  isDirectory: file.isDirectory,
                  isSymbolicLink: file.isSymbolicLink,
                }).pipe(
                  Effect.tapError((error) =>
                    Match.value(error).pipe(
                      Match.tagsExhaustive({
                        StatError: () =>
                          Effect.sync(() =>
                            fileErrors.push({ path: file.path, message: "couldn't get file info" })
                          ),
                        // TODO: write a test for this case! we rely on the next scanning process to cleanup
                        // these files from the unidentified files table if they throw DirectoryError,
                        // NoExtensionError, or UnsupportedExtensionError
                        DirectoryError: () =>
                          Effect.sync(() =>
                            fileErrors.push({ path: file.path, message: 'file is a directory' })
                          ),
                        NoExtensionError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: "file doesn't have an extension",
                            })
                          ),
                        UnsupportedExtensionError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: "file extension isn't supported by this library",
                            })
                          ),
                        DbError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: "couldn't get file info from database",
                            })
                          ),
                        // TODO: write a test for these cases! we don't care if the file is part of a book already,
                        // since it is deleted. and if it is considered to be up-to-date in the identified files table,
                        // we want the metadata since we are moving it to unidentified files
                        UpToDateError: (error) => Effect.succeed(error.data),
                        // TODO: write a test for this case! we don't care if the file is a symlink or not,
                        // since the realPath is only used during automatic file identification when scanning
                        RealpathError: (error) => Effect.succeed(error.data),
                      })
                    )
                  ),
                  Effect.map((data) => ({ ...data, path: path.join(file.parentPath, file.name) })),
                  Effect.option
                )
              ))
                .filter((i) => Option.isSome(i))
                .map((i) => i.value);

              const fileMetadata = (yield* Effect.forEach(files, (file) =>
                extractAudiobookFileMetadata({
                  file: {
                    metadataHashFromDb: file.metadataHashFromDb,
                    path: file.path,
                  },
                }).pipe(
                  Effect.tapError((error) =>
                    Match.value(error).pipe(
                      Match.tagsExhaustive({
                        NoAlbumTitleOrArtistNameError: (error) => Effect.succeed(error.data),
                        UpToDateError: (error) => Effect.succeed(error.data),
                        FFProbeKnownError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: 'error extracting metadata',
                            })
                          ),
                        FFProbeUnknownError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: 'unknown error extracting metadata',
                            })
                          ),
                        BunShellSyntaxError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: 'could not parse metadata output',
                            })
                          ),
                        ParseError: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: 'metadata was not in expected format',
                            })
                          ),
                        UnknownException: () =>
                          Effect.sync(() =>
                            fileErrors.push({
                              path: file.path,
                              message: 'unknown error extracting metadata',
                            })
                          ),
                      })
                    )
                  ),
                  Effect.map((result) => ({ ...result, path: file.path, mtimeMs: file.mtimeMs })),
                  Effect.option
                )
              ))
                .filter((i) => Option.isSome(i))
                .map((i) => i.value);

              if (fileMetadata.length > 0) {
                yield* markAsUnidentified({
                  // TODO: fix this! add proper support for the same book in multiple libraries for the client
                  libraryId: deletedFiles[0]!.libraryId,
                  files: fileMetadata,
                  reason: 'USER_DELETED_FROM_BOOK',
                }).pipe(
                  Effect.tapError(() =>
                    Effect.sync(() =>
                      fileErrors.push({ message: "Couldn't update unidentified files" })
                    )
                  ),
                  Effect.asVoid
                );
              }
            })
          );

          if (fileErrors.length > 0) {
            return {
              message:
                'Files have been saved sucessfully. But, some files were deleted from the book, and there were errors re-adding them as unidentified files. Please identify these files as the correct book, or they may get re-identified as this book again on the next scan if their database metadata is out-of-date with the actual file.',
              fileErrors,
            } as const;
          }
        }
      }),
  }),
});

const searchProgram = Effect.fn(function* ({
  asin,
  title,
  author,
}: {
  asin?: string;
  title?: string;
  author?: string;
}) {
  const audible = yield* Audible;

  if (asin) {
    return yield* audible
      .getBooksBySearch({
        asins: [asin],
      })
      .pipe(
        Effect.catchTags({
          ParseError: () =>
            Effect.fail({
              message: 'Error while parsing search results',
            } as const),
          RequestError: () =>
            Effect.fail({
              message: 'Error while making search request',
            } as const),
          ResponseError: () =>
            Effect.fail({
              message: 'Error while processing search response',
            } as const),
        })
      );
  }

  if (title || author) {
    return yield* audible
      .getBooksBySearch({
        title,
        author,
      })
      .pipe(
        Effect.catchTags({
          ParseError: () =>
            Effect.fail({
              message: 'Error while parsing search results',
            } as const),
          RequestError: () =>
            Effect.fail({
              message: 'Error while making search request',
            } as const),
          ResponseError: () =>
            Effect.fail({
              message: 'Error while processing search response',
            } as const),
        })
      );
  }

  return [];
});
