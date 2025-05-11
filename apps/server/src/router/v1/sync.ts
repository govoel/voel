import type { SourceTapEvents } from '@voel/source-tap';
import { z } from 'zod';

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
        author: z.number(),
        series: z.number(),
        book: z.number(),
        bookAuthor: z.number(),
        bookSeries: z.number(),
        bookContributor: z.number(),
        audiobookFile: z.number(),
        audiobookChapter: z.number(),
        ebookFile: z.number(),
      })
    )
    .subscription(async function* ({ input, signal }) {
      let unsubscribe = () => {};

      const eventStream = new ReadableStream<{
        type: 'live';
        payload: Parameters<SourceTapEvents<DatabaseSchema>['update']>[0];
      }>({
        async start(controller) {
          const onUpdate: SourceTapEvents<DatabaseSchema>['update'] = (payload) => {
            controller.enqueue({ type: 'live' as const, payload });
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
            .select(['id', 'name', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.library),
        },
        {
          name: 'author',
          query: db
            .selectFrom('author')
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
            .where('updatedAt', '>=', input.author),
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
          name: 'bookAuthor',
          query: db
            .selectFrom('bookAuthor')
            .select(['id', 'bookId', 'authorId', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.bookAuthor),
        },
        {
          name: 'bookSeries',
          query: db
            .selectFrom('bookSeries')
            .select([
              'id',
              'bookId',
              'seriesId',
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
            .select(['id', 'bookId', 'name', 'role', 'createdAt', 'updatedAt', 'deletedAt'])
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
      ] as const;

      for (const table of tables) {
        // if statements for strong type-safety on the client
        if (table.name === 'library') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'library' as const, row } };
          }
        } else if (table.name === 'author') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'author' as const, row } };
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
        } else if (table.name === 'bookAuthor') {
          const stream = table.query.stream();
          for await (const row of stream) {
            yield { type: 'history' as const, payload: { table: 'bookAuthor' as const, row } };
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
        }
      }

      yield { type: 'historyComplete' as const };

      for await (const payload of eventIterator) {
        yield payload;
      }
    }),
});
