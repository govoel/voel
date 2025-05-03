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
          .with('booksWithAuthors', (db) =>
            db
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
                join
                  .on('bookAuthor.deletedAt', 'is', null)
                  .onRef('book.id', '=', 'bookAuthor.bookId')
              )
              .leftJoin('author', (join) =>
                join
                  .on('author.deletedAt', 'is', null)
                  .onRef('author.id', '=', 'bookAuthor.authorId')
              )
              .groupBy('book.id')
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
              ])
          )
          .selectFrom('series')
          .where('series.id', '=', seriesId)
          .where('series.deletedAt', 'is', null)
          .crossJoin('booksWithAuthors')
          .select([
            'series.id',
            'series.name',
            'series.summary',
            'series.createdAt',
            'series.updatedAt',
            (eb) =>
              eb
                .fn<string>('json_group_array', [
                  eb.fn('json_object', [
                    eb.val('id'),
                    eb.ref('booksWithAuthors.id'),
                    eb.val('title'),
                    eb.ref('booksWithAuthors.title'),
                    eb.val('cover'),
                    eb.ref('booksWithAuthors.cover'),
                    eb.val('coverThumbhash'),
                    eb.ref('booksWithAuthors.coverThumbhash'),
                    eb.val('sort'),
                    eb.ref('booksWithAuthors.sort'),
                    eb.val('label'),
                    eb.ref('booksWithAuthors.label'),
                    eb.val('authors'),
                    eb.ref('booksWithAuthors.authors'),
                  ]),
                ])
                .as('books'),
          ]);

        const results = await query.executeTakeFirstOrThrow();

        return {
          ...results,
          books: (
            JSON.parse(results.books) as (Pick<
              Selectable<InstanceDatabase['book']>,
              'id' | 'title' | 'cover' | 'coverThumbhash'
            > &
              Pick<Selectable<InstanceDatabase['bookSeries']>, 'label' | 'sort'> & {
                authors: string;
              })[]
          ).map((book) => ({
            ...book,
            authors: JSON.parse(book.authors) as Pick<
              Selectable<InstanceDatabase['author']>,
              'id' | 'name'
            >[],
          })),
        };
      },
    });
  },
};

export { get };
