import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, type Selectable } from 'kysely';

import type { InstanceDatabase } from '~/db/schema/instance';

const get = {
  queryKey: ['instance', 'author', 'get'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, authorId: number) => {
    return useReactQuery({
      queryKey: [...get.queryKey, authorId],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .with('booksWithAuthors', (db) =>
            db
              .selectFrom('book')
              .where('book.deletedAt', 'is', null)
              .innerJoin('bookAuthor as searchAuthor', (join) =>
                join
                  .on('searchAuthor.authorId', '=', authorId)
                  .on('searchAuthor.deletedAt', 'is', null)
                  .onRef('book.id', '=', 'searchAuthor.bookId')
              )
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
          .selectFrom('author')
          .where('author.id', '=', authorId)
          .where('author.deletedAt', 'is', null)
          .crossJoin('booksWithAuthors')
          .select([
            'author.id',
            'author.name',
            'author.avatar',
            'author.avatarThumbhash',
            'author.about',
            'author.createdAt',
            'author.updatedAt',
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
            > & { authors: string })[]
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
