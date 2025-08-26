import { FsExtended } from './fsExtended';
import type { Hash } from './hash';
import { gatherAuxiliaryAudiobookData } from './matching/gatherAuxiliaryAudiobookData';
import { insertAudiobook } from './matching/insertAudiobook';
import { extractAudiobookFileMetadata } from './scanning/extractAudiobookFileMetadata';
import { prepareAudiobookFile } from './scanning/prepareAudiobookFile';
import { Path } from '@effect/platform';
import { TRPCError } from '@trpc/server';
import { schemas } from '@voel/schemas';
import { Effect, Either, Schema } from 'effect';
import { NoResultError } from 'kysely';

import { Audible, ProductBookSchema } from '@/router/v1/library/audible';
import { getLibraryActor } from '@/router/v1/library/machine';

import { db, isSQLiteError } from '@/libs/db';
import { AppRuntime } from '@/libs/effect/runtime';
import { levenshteinDistance } from '@/libs/utils';

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

  unmatched: createTRPCRouter({
    getFiles: adminProcedure
      .input(schemas.v1.library.unmatched.getFiles)
      .query(async ({ input }) => {
        const results = await db
          .selectFrom('unmatchedAudiobookFile')
          .where('libraryId', '=', input.id)
          .where('deletedAt', 'is', null)
          .select(['parentPath', 'name', 'durationMs', 'disc', 'track', 'reason', 'metadata'])
          .execute();

        return results.map((result) => ({
          ...result,
          metadata: JSON.parse(result.metadata) as Record<string, string | undefined>,
        }));
      }),

    search: adminProcedure
      .input(schemas.v1.library.unmatched.search)
      .mutation(
        async ({ input: { asin, title, author, fileTitle, fileAuthor, fileDurationMs } }) => {
          if (asin || title || author) {
            const result = await AppRuntime.runPromise(
              searchProgram({
                asin,
                title,
                author,
                fileTitle,
                fileAuthor,
                fileDurationMs,
              }).pipe(Effect.either)
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
        }
      ),

    identify: adminProcedure
      .input(schemas.v1.library.unmatched.identify)
      .mutation(async ({ input }) => {
        const result = await AppRuntime.runPromise(
          Effect.gen(function* () {
            const fs = yield* FsExtended;
            const path = yield* Path.Path;
            const fileStats = yield* Effect.forEach(input.files, (file) =>
              fs.lstat(path.join(file.parentPath, file.name)).pipe(
                Effect.catchTags({
                  BadArgument: () =>
                    Effect.fail({
                      message: 'Error getting info for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  SystemError: () =>
                    Effect.fail({
                      message: 'Error getting info for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                }),
                Effect.map((stat) => ({
                  parentPath: file.parentPath,
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
                  UpToDateError: () =>
                    Effect.fail({
                      message:
                        'File is up to date, please un-identify it first before re-identifying it',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  RealpathError: (error) =>
                    Effect.fail({
                      message: `Error resolving symbolic link for file`,
                      description: error.message,
                    } as const),
                })
              )
            );

            const fileMetadata = yield* Effect.forEach(files, (file) =>
              extractAudiobookFileMetadata({ file }).pipe(
                Effect.catchTags({
                  NoAlbumTitleOrArtistNameError: (error) => Effect.succeed(error),
                  UpToDateError: () =>
                    Effect.fail({
                      message:
                        'File is up to date, please un-identify it first before re-identifying it',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  FFProbeKnownError: () =>
                    Effect.fail({
                      message: 'Error while extracting metadata for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  FFProbeUnknownError: () =>
                    Effect.fail({
                      message: 'Unknown error while extracting metadata for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  BunShellSyntaxError: () =>
                    Effect.fail({
                      message: 'Failed to parse metadata output for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  ParseError: () =>
                    Effect.fail({
                      message: 'Extracted metadata was not in the expected format for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                  UnknownException: () =>
                    Effect.fail({
                      message: 'Unknown error while extracting metadata for file',
                      description: path.join(file.parentPath, file.name),
                    } as const),
                })
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
});

const searchProgram = Effect.fn(function* ({
  asin,
  title,
  author,
  fileTitle,
  fileAuthor,
  fileDurationMs,
}: {
  asin?: string;
  title?: string;
  author?: string;
  fileTitle?: string;
  fileAuthor?: string;
  fileDurationMs?: number;
}) {
  const audible = yield* Audible;

  if (asin) {
    const results = yield* audible
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

    // For ASIN searches, add duration difference if file duration is provided
    if (fileDurationMs !== undefined) {
      return results.map((result) => ({
        ...result,
        durationDifferenceMs: Math.abs(result.runtime_length_min * 60 * 1000 - fileDurationMs),
      }));
    }

    return results;
  }

  if (title || author) {
    const results = yield* audible
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

    // If we have file metadata, calculate distances and sort the results
    if (fileTitle || fileAuthor || fileDurationMs !== undefined) {
      const enhancedResults = results.map((result) => {
        // Calculate Levenshtein distances
        const titleDistance = fileTitle
          ? levenshteinDistance(fileTitle.toLowerCase().trim(), result.title.toLowerCase().trim())
          : Number.MAX_SAFE_INTEGER;

        const authorDistance = fileAuthor
          ? Math.min(
              ...result.authors.map((author) =>
                levenshteinDistance(
                  fileAuthor.toLowerCase().trim(),
                  author.name.toLowerCase().trim()
                )
              )
            )
          : Number.MAX_SAFE_INTEGER;

        // Calculate duration difference in milliseconds
        const durationDifferenceMs =
          fileDurationMs !== undefined
            ? Math.abs(result.runtime_length_min * 60 * 1000 - fileDurationMs)
            : Number.MAX_SAFE_INTEGER;

        return {
          ...result,
          titleDistance,
          authorDistance,
          durationDifferenceMs,
        };
      });

      // Sort by: 1) title distance, 2) author distance, 3) duration difference
      enhancedResults.sort((a, b) => {
        if (a.titleDistance !== b.titleDistance) {
          return a.titleDistance - b.titleDistance;
        }
        if (a.authorDistance !== b.authorDistance) {
          return a.authorDistance - b.authorDistance;
        }
        return a.durationDifferenceMs - b.durationDifferenceMs;
      });

      return enhancedResults;
    }

    return results;
  }

  return [];
});
