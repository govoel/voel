import { TRPCError } from '@trpc/server';
import type { SourceTapEvents } from '@voel/source-tap';
import * as z from 'zod';

import { db, sourceTap } from '@/libs/db';
import type { DatabaseSchema } from '@/libs/db/schema';

import { createTRPCRouter, protectedProcedure } from '@/trpc';

function streamToAsyncIterable<TValue>(
  stream: ReadableStream<TValue>,
  signal?: AbortSignal
): AsyncIterable<TValue> {
  if (signal?.aborted) {
    const iterator: AsyncIterator<TValue> = {
      next: async () => ({
        value: undefined,
        done: true,
      }),
    };
    return {
      [Symbol.asyncIterator]: () => iterator,
    };
  }

  const reader = stream.getReader();

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        reader.cancel().catch(() => {
          // noop
        });
      },
      { once: true }
    );
  }

  const iterator: AsyncIterator<TValue> = {
    async next() {
      const value = await reader.read();
      if (value.done) {
        return {
          value: undefined,
          done: true,
        };
      }
      return {
        value: value.value,
        done: false,
      };
    },
    async return() {
      await reader.cancel();
      return {
        value: undefined,
        done: true,
      };
    },
  };

  return {
    [Symbol.asyncIterator]: () => iterator,
  };
}

export const syncRouter = createTRPCRouter({
  subscribe: protectedProcedure
    .input(
      z.object({
        library: z.number(),
        contributor: z.number(),
        series: z.number(),
        book: z.number(),
        bookSeries: z.number(),
        bookContributor: z.number(),
        audiobookFile: z.number(),
        audiobookChapter: z.number(),
        ebookFile: z.number(),
        playbackHistory: z.number(),
      })
    )
    .subscription(async function* ({ ctx, input, signal }) {
      let unsubscribe = () => {};

      const eventStream = new ReadableStream<{
        type: 'live';
        payload: Parameters<SourceTapEvents<DatabaseSchema>['update']>[0];
      }>({
        async start(controller) {
          const onUpdate: SourceTapEvents<DatabaseSchema>['update'] = (payload) => {
            if (payload.table === 'playbackHistory') {
              const userRows = payload.rows.filter((row) => row.userId === ctx.user.id);
              if (userRows.length > 0) {
                controller.enqueue({
                  type: 'live' as const,
                  payload: { table: 'playbackHistory', rows: userRows },
                });
              }
            } else {
              controller.enqueue({ type: 'live' as const, payload });
            }
          };
          sourceTap.events.on('update', onUpdate);
          unsubscribe = () => {
            sourceTap.events.off('update', onUpdate);
          };
        },
        cancel() {
          unsubscribe();
        },
      });

      const eventIterator = streamToAsyncIterable(eventStream, signal);

      const tables = [
        {
          name: 'library',
          query: db
            .selectFrom('library')
            .select(['id', 'name', 'path', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.library),
        },
        {
          name: 'contributor',
          query: db
            .selectFrom('contributor')
            .select([
              'id',
              'asin',
              'name',
              'about',
              'avatar',
              'avatarThumbhash',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.contributor),
        },
        {
          name: 'series',
          query: db
            .selectFrom('series')
            .select(['id', 'asin', 'name', 'summary', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.series),
        },
        {
          name: 'book',
          query: db
            .selectFrom('book')
            .select([
              'id',
              'asin',
              'type',
              'otherTypeId',
              'title',
              'subtitle',
              'cover',
              'coverThumbhash',
              'summary',
              'adultsOnly',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.book),
        },
        {
          name: 'bookSeries',
          query: db
            .selectFrom('bookSeries')
            .select([
              'id',
              'bookId',
              'seriesId',
              'title',
              'label',
              'sort',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.bookSeries),
        },
        {
          name: 'bookContributor',
          query: db
            .selectFrom('bookContributor')
            .select([
              'id',
              'bookId',
              'contributorId',
              'name',
              'role',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.bookContributor),
        },
        {
          name: 'audiobookFile',
          query: db
            .selectFrom('audiobookFile')
            .select([
              'id',
              'libraryId',
              'bookId',
              'path',
              'mtimeMs',
              'metadataHash',
              'durationMs',
              'disc',
              'track',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.audiobookFile),
        },
        {
          name: 'audiobookChapter',
          query: db
            .selectFrom('audiobookChapter')
            .select([
              'id',
              'parentId',
              'bookId',
              'fileId',
              'source',
              'title',
              'durationMs',
              'startOffsetMs',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.audiobookChapter),
        },
        {
          name: 'ebookFile',
          query: db
            .selectFrom('ebookFile')
            .select(['id', 'libraryId', 'bookId', 'path', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.ebookFile),
        },
        {
          name: 'playbackHistory',
          query: db
            .selectFrom('playbackHistory')
            .select([
              'id',
              'userId',
              'type',
              'bookId',
              'positionMs',
              'eventTimestampMs',
              'sessionId',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('userId', '=', ctx.user.id)
            .where('updatedAt', '>=', input.playbackHistory),
        },
      ] as const;

      for (const table of tables) {
        // if statements for strong type-safety on the client
        if (table.name === 'library') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'library' as const, row } };
          }
        } else if (table.name === 'contributor') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'contributor' as const, row } };
          }
        } else if (table.name === 'series') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'series' as const, row } };
          }
        } else if (table.name === 'book') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'book' as const, row } };
          }
        } else if (table.name === 'bookSeries') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'bookSeries' as const, row } };
          }
        } else if (table.name === 'bookContributor') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'bookContributor' as const, row } };
          }
        } else if (table.name === 'audiobookFile') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'audiobookFile' as const, row } };
          }
        } else if (table.name === 'audiobookChapter') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield {
              type: 'history' as const,
              payload: { table: 'audiobookChapter' as const, row },
            };
          }
        } else if (table.name === 'ebookFile') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'ebookFile' as const, row } };
          }
        } else if (table.name === 'playbackHistory') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'playbackHistory' as const, row } };
          }
        }
      }

      yield { type: 'historyComplete' as const };

      for await (const payload of eventIterator) {
        yield payload;
      }
    }),

  playbackHistory: protectedProcedure
    .input(
      z.array(
        z.object({
          type: z.number(),
          bookId: z.number(),
          positionMs: z.number(),
          eventTimestampMs: z.number(),
          sessionId: z.string(),
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      const insertedHistory = await db
        .insertInto('playbackHistory')
        .values(
          input.map((event) => ({
            userId: ctx.user.id,
            type: event.type,
            bookId: event.bookId,
            positionMs: event.positionMs,
            eventTimestampMs: event.eventTimestampMs,
            sessionId: event.sessionId,
          }))
        )
        .onConflict((oc) =>
          oc
            // purely so RETURNING works correctly
            .doUpdateSet({ deletedAt: (eb) => eb.ref('excluded.deletedAt') })
        )
        .returning(['eventTimestampMs as eventTimestampMs'])
        .execute()
        .catch((err) => {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `An error occurred while updating playback history: ${err.message}. Please try again later.`,
          });
        });

      return insertedHistory.reduce(
        (max, current) => Math.max(max, current.eventTimestampMs),
        -Infinity
      );
    }),
});
