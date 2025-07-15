import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import { mainDb } from '~/db/client';
import type { InstanceDatabase } from '~/db/schema/instance';

import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';

export const authorsQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'author'] as const,
  list: (instanceId: string) => [...authorsQueryKeys.all(instanceId), 'list'] as const,
  get: (instanceId: string, authorId: number) =>
    [...authorsQueryKeys.all(instanceId), 'get', authorId] as const,
  search: (instanceId: string, query: string) =>
    [...authorsQueryKeys.all(instanceId), 'search', query] as const,
  listBooks: (instanceId: string, authorId: number) =>
    [...authorsQueryKeys.all(instanceId), 'listBooks', authorId] as const,
};

const list = {
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: authorsQueryKeys.list(instanceId),
      networkMode: 'always',
      queryFn: async () => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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
          .innerJoin('bookAuthor', (join) =>
            join
              .onRef('author.id', '=', 'bookAuthor.authorId')
              .on('bookAuthor.deletedAt', 'is', null)
          )
          .select((eb) => [eb.fn.count<number>('bookAuthor.bookId').as('bookCount')])
          .groupBy('author.id')
          .orderBy('author.updatedAt', 'desc');

        if (role === 'under18') {
          query = query.innerJoin('book', (join) =>
            join
              .onRef('book.id', '=', 'bookAuthor.bookId')
              .on('book.deletedAt', 'is', null)
              .on('book.adultsOnly', '=', 0)
          );
        }

        return await query.execute();
      },
    });
  },
};

const get = {
  useQuery: (authorId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: authorsQueryKeys.get(instanceId, authorId),
      networkMode: 'always',
      queryFn: async () => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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

        if (role === 'under18') {
          query = query
            .innerJoin('bookAuthor', (join) =>
              join
                .onRef('author.id', '=', 'bookAuthor.authorId')
                .on('bookAuthor.deletedAt', 'is', null)
            )
            .innerJoin('book', (join) =>
              join
                .onRef('book.id', '=', 'bookAuthor.bookId')
                .on('book.deletedAt', 'is', null)
                .on('book.adultsOnly', '=', 0)
            )
            .groupBy('author.id');
        }

        return await query.executeTakeFirstOrThrow();
      },
    });
  },
};

const search = {
  useQuery: (searchQuery: string) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: authorsQueryKeys.search(instanceId, searchQuery),
      networkMode: 'always',
      queryFn: async () => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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
          .innerJoin('bookAuthor', (join) =>
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

        if (role === 'under18') {
          query = query.innerJoin('book', (join) =>
            join
              .onRef('book.id', '=', 'bookAuthor.bookId')
              .on('book.deletedAt', 'is', null)
              .on('book.adultsOnly', '=', 0)
          );
        }

        query = query.orderBy('author.updatedAt', 'desc');

        return await query.execute();
      },
    });
  },
};

const listBooks = {
  useQuery: (authorId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: authorsQueryKeys.listBooks(instanceId, authorId),
      networkMode: 'always',
      queryFn: async () => {
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

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

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

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
