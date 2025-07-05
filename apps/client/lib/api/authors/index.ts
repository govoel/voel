import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, type Selectable } from 'kysely';

import type { InstanceDatabase } from '~/db/schema/instance';

const list = {
  queryKey: ['instance', 'author', 'list'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>) => {
    return useReactQuery({
      queryKey: list.queryKey,
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('author')
          .where('author.deletedAt', 'is', null)
          .select([
            'author.id',
            'author.name',
            'author.avatar',
            'author.avatarThumbhash',
            'author.createdAt',
            'author.updatedAt',
          ])
          .leftJoin('bookAuthor', (join) =>
            join
              .onRef('author.id', '=', 'bookAuthor.authorId')
              .on('bookAuthor.deletedAt', 'is', null)
          )
          .select((eb) => [eb.fn.count<number>('bookAuthor.bookId').as('bookCount')])
          .groupBy('author.id')
          .orderBy('author.updatedAt', 'desc');

        return await query.execute();
      },
    });
  },
};

const get = {
  queryKey: ['instance', 'author', 'get'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, authorId: number) => {
    return useReactQuery({
      queryKey: [...get.queryKey, authorId],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('author')
          .where('author.id', '=', authorId)
          .where('author.deletedAt', 'is', null)
          .select([
            'author.id',
            'author.name',
            'author.avatar',
            'author.avatarThumbhash',
            'author.about',
            'author.createdAt',
            'author.updatedAt',
          ]);

        return await query.executeTakeFirstOrThrow();
      },
    });
  },
};

const search = {
  queryKey: ['instance', 'author', 'search'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, searchQuery: string) =>
    useReactQuery({
      queryKey: [...search.queryKey, searchQuery],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('author')
          .where('author.deletedAt', 'is', null)
          .select([
            'author.id',
            'author.name',
            'author.avatar',
            'author.avatarThumbhash',
            'author.createdAt',
            'author.updatedAt',
          ])
          .leftJoin('bookAuthor', (join) =>
            join
              .onRef('author.id', '=', 'bookAuthor.authorId')
              .on('bookAuthor.deletedAt', 'is', null)
          )
          .select((eb) => [eb.fn.count<number>('bookAuthor.bookId').as('bookCount')])
          .groupBy('author.id');

        if (searchQuery.length > 0) {
          query = query
            .innerJoin('authorFTS', (join) =>
              join
                .on('authorFTS.name', 'match', searchQuery)
                .onRef('author.id', '=', 'authorFTS.rowid')
            )
            // the better the match, the smaller the value
            .orderBy('authorFTS.rank', 'asc');
        }

        query = query.orderBy('author.updatedAt', 'desc');

        return await query.execute();
      },
    }),
};

const listBooks = {
  queryKey: ['instance', 'author', 'listBooks'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, authorId: number) => {
    return useReactQuery({
      queryKey: [...listBooks.queryKey, authorId],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .with('playbackHistoryBooks', (db) =>
            db
              .selectFrom('playbackHistory')
              .where('deletedAt', 'is', null)
              .select(({ fn }) => [
                'id',
                'bookId',
                'positionMs',
                fn.max('updatedAt').as('updatedAt'),
              ])
              .groupBy('playbackHistory.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('bookAuthor as searchAuthor', (join) =>
            join
              .on('searchAuthor.authorId', '=', authorId)
              .on('searchAuthor.deletedAt', 'is', null)
              .onRef('book.id', '=', 'searchAuthor.bookId')
          )
          .leftJoin('bookAuthor', (join) =>
            join.on('bookAuthor.deletedAt', 'is', null).onRef('book.id', '=', 'bookAuthor.bookId')
          )
          .leftJoin('author', (join) =>
            join.on('author.deletedAt', 'is', null).onRef('author.id', '=', 'bookAuthor.authorId')
          )
          .leftJoin('audiobookFile', (join) =>
            join
              .onRef('audiobookFile.bookId', '=', 'book.id')
              .on('audiobookFile.deletedAt', 'is', null)
          )
          .leftJoin('playbackHistoryBooks', (join) =>
            join.onRef('playbackHistoryBooks.bookId', '=', 'book.id')
          )
          .groupBy('book.id')
          .select((eb) => [
            'book.id',
            'book.title',
            'book.cover',
            'book.coverThumbhash',
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
            eb.fn
              .coalesce(eb.fn.sum<number | null>('audiobookFile.durationMs'), eb.lit(0))
              .as('totalDurationMs'),
            eb.fn.coalesce('playbackHistoryBooks.positionMs', eb.lit(0)).as('playbackPositionMs'),
            eb.fn
              .coalesce('playbackHistoryBooks.updatedAt', eb.lit(0))
              .as('playbackPositionUpdatedAt'),
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

export { list, get, search, listBooks };
