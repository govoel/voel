import type { SolarCoreEvents } from '@apricotta/solar-core';
import { z } from 'zod';

import { db, solarCore } from '@/libs/db';
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
        audiobookChapter: z.number(),
        audiobookFile: z.number(),
        ebookFile: z.number(),
      })
    )
    .subscription(async function* ({ input, signal }) {
      let unsubscribe = () => {};

      const eventStream = new ReadableStream<{
        type: 'live';
        payload: Parameters<SolarCoreEvents<DatabaseSchema>['update']>[0];
      }>({
        async start(controller) {
          const onUpdate: SolarCoreEvents<DatabaseSchema>['update'] = (payload) => {
            controller.enqueue({ type: 'live' as const, payload });
          };
          solarCore.events.on('update', onUpdate);
          unsubscribe = () => {
            solarCore.events.off('update', onUpdate);
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
            .select(['bookId', 'authorId', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.bookAuthor),
        },
        {
          name: 'bookSeries',
          query: db
            .selectFrom('bookSeries')
            .select(['bookId', 'seriesId', 'label', 'sort', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.bookSeries),
        },
        {
          name: 'bookContributor',
          query: db
            .selectFrom('bookContributor')
            .select(['bookId', 'name', 'role', 'createdAt', 'updatedAt', 'deletedAt'])
            .where('updatedAt', '>=', input.bookContributor),
        },
        {
          name: 'audiobookChapter',
          query: db
            .selectFrom('audiobookChapter')
            .select([
              'id',
              'bookId',
              'parentId',
              'source',
              'title',
              'duration',
              'startOffset',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.audiobookChapter),
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
              'duration',
              'disc',
              'track',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ])
            .where('updatedAt', '>=', input.audiobookFile),
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
        const stream = table.query.stream();

        for await (const row of stream) {
          yield { type: 'history' as const, payload: { table: table.name, row } };
        }
      }

      for await (const payload of eventIterator) {
        yield payload;
      }
    }),
});
