import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import type { InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

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
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('author')
          .where('author.deletedAt', 'is', null)
          .select(['author.id', 'author.name', 'author.avatar', 'author.avatarThumbhash'])
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
        const role = await getRole(instanceId);

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
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('author')
          .where('author.deletedAt', 'is', null)
          .select(['author.id', 'author.name', 'author.avatar', 'author.avatarThumbhash'])
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
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('searchAuthor', (eb) =>
            eb
              .selectFrom('bookAuthor')
              .select('bookAuthor.bookId')
              .where('bookAuthor.authorId', '=', authorId)
              .where('bookAuthor.deletedAt', 'is', null)
          )
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookAuthor')
              .where('bookAuthor.deletedAt', 'is', null)
              .innerJoin('searchAuthor', (join) =>
                join.onRef('bookAuthor.bookId', '=', 'searchAuthor.bookId')
              )
              .innerJoin('author', (join) =>
                join
                  .onRef('author.id', '=', 'bookAuthor.authorId')
                  .on('author.deletedAt', 'is', null)
              )
              .select((eb) => [
                'bookAuthor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [
                      eb.val('id'),
                      'author.id',
                      eb.val('name'),
                      'author.name',
                    ]),
                  ])
                  .as('authors'),
              ])
              .groupBy('bookAuthor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('searchAuthor', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'searchAuthor.bookId')
              )
              .select((eb) => [
                'audiobookFile.bookId',
                eb.fn.sum<number | null>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('authorsArray', (join) => join.onRef('book.id', '=', 'authorsArray.bookId'))
          .leftJoin('audiobookFileDurations', (join) =>
            join.onRef('book.id', '=', 'audiobookFileDurations.bookId')
          )
          .leftJoin('latestPlaybackPosition', (join) =>
            join.onRef('book.id', '=', 'latestPlaybackPosition.bookId')
          )
          .select((eb) => [
            'book.id',
            'book.title',
            'book.cover',
            'book.coverThumbhash',
            'authorsArray.authors',
            eb.fn
              .coalesce('audiobookFileDurations.totalDurationMs', eb.lit(0))
              .as('totalDurationMs'),
            eb
              .fn<string>('json_object', [
                eb.val('positionMs'),
                eb.fn.coalesce('latestPlaybackPosition.positionMs', eb.lit(0)),
                eb.val('eventTimestampMs'),
                eb.fn.coalesce('latestPlaybackPosition.eventTimestampMs', eb.lit(0)),
              ])
              .as('playbackPosition'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          playbackPosition: JSON.parse(result.playbackPosition) as {
            positionMs: number;
            eventTimestampMs: number;
          },
          authors: result.authors
            ? (JSON.parse(result.authors) as Pick<
                Selectable<InstanceDatabase['author']>,
                'id' | 'name'
              >[])
            : [],
        }));
      },
    });
  },
};

export { list, get, search, listBooks };
