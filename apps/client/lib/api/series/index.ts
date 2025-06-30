import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, type Selectable } from 'kysely';

import type { InstanceDatabase } from '~/db/schema/instance';

const get = {
  queryKey: ['instance', 'series', 'get'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, seriesId: number) => {
    return useReactQuery({
      queryKey: [...get.queryKey, seriesId],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('series')
          .where('series.id', '=', seriesId)
          .where('series.deletedAt', 'is', null)
          .select([
            'series.id',
            'series.name',
            'series.summary',
            'series.createdAt',
            'series.updatedAt',
          ]);

        return await query.executeTakeFirstOrThrow();
      },
    });
  },
};

const listBooks = {
  queryKey: ['instance', 'series', 'listBooks'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, seriesId: number) => {
    return useReactQuery({
      queryKey: [...listBooks.queryKey, seriesId],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('bookSeries as searchSeries', (join) =>
            join
              .on('searchSeries.seriesId', '=', seriesId)
              .on('searchSeries.deletedAt', 'is', null)
              .onRef('book.id', '=', 'searchSeries.bookId')
          )
          .select(['searchSeries.sort', 'searchSeries.label'])
          .leftJoin('bookAuthor', (join) =>
            join.on('bookAuthor.deletedAt', 'is', null).onRef('book.id', '=', 'bookAuthor.bookId')
          )
          .leftJoin('author', (join) =>
            join.on('author.deletedAt', 'is', null).onRef('author.id', '=', 'bookAuthor.authorId')
          )
          .groupBy('book.id')
          .orderBy('searchSeries.sort', 'asc')
          .select([
            'book.id',
            'book.title',
            'book.cover',
            'book.coverThumbhash',
            'searchSeries.sort',
            'searchSeries.label',
            (eb) =>
              eb
                .fn<string>('json_group_array', [
                  eb.fn('json_object', [
                    eb.val('id'),
                    eb.ref('author.id'),
                    eb.val('name'),
                    eb.ref('author.name'),
                  ]),
                ])
                .as('authors'),
          ]);

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          authors: JSON.parse(result.authors) as Pick<
            Selectable<InstanceDatabase['author']>,
            'id' | 'name'
          >[],
        }));
      },
    });
  },
};

export { get, listBooks };
