import { Path } from '@effect/platform';
import { TRPCError } from '@trpc/server';
import { schemas } from '@voel/schemas';
import { Effect, Either } from 'effect';
import { NoResultError, sql } from 'kysely';
import * as path from 'node:path';

import { Audible } from '@/router/v1/library/audible';
import { FsExtended } from '@/router/v1/library/fsExtended';
import { Hash } from '@/router/v1/library/hash';
import { forceIdentifyAudiobook } from '@/router/v1/library/identifying/forceIdentifyAudiobook';
import { getLibraryActor } from '@/router/v1/library/machine';

import { db, isSQLiteError } from '@/libs/db';
import { AppRuntime } from '@/libs/effect/runtime';

import { adminProcedure, createTRPCRouter } from '@/trpc';

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
export async function runDatabaseCleanup(): Promise<void> {
  const now = sql<number>`(unixepoch())`;

  await db
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
    .execute();
}

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
          .selectFrom('audiobookFile')
          .where('libraryId', '=', input.id)
          .where('bookId', 'is', null)
          .where('deletedAt', 'is', null)
          .select(['path', 'durationMs', 'disc', 'track', 'reason'])
          .execute();

        return results.map((result) => ({
          directory: path.dirname(result.path),
          name: path.basename(result.path),
          durationMs: result.durationMs,
          disc: result.disc,
          track: result.track,
          reason: result.reason,
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
          forceIdentifyAudiobook(input).pipe(Effect.either) satisfies Effect.Effect<
            Either.Either<{ id: number }, { message: string; description?: string }>,
            never,
            Audible | Path.Path | FsExtended | Hash
          >
        );

        if (Either.isRight(result)) {
          await runDatabaseCleanup();
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

          return await trx
            .updateTable('audiobookFile')
            .set({ bookId: null, reason: 'USER_DELETED_FROM_BOOK' as const })
            .where('audiobookFile.bookId', '=', input.bookId)
            .where(
              'audiobookFile.id',
              'not in',
              input.files.map((file) => file.id)
            )
            .returning(['audiobookFile.libraryId', 'audiobookFile.path'])
            .execute();
        });

        await runDatabaseCleanup();

        // TODO: trigger a re-scan ONLY for the files that were just un-identified, so that
        // the file is up-to-date when the user attempts to re-identify it

        return {
          message:
            deletedFiles.length > 0
              ? `Successfully saved changes to book files`
              : `Successfully saved changes to book files, and ${deletedFiles.length} files have been queued for a scan`,
        };
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
