import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import type { InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

export const seriesQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'series'] as const,
  list: (instanceId: string) => [...seriesQueryKeys.all(instanceId), 'series', 'list'] as const,
  get: (instanceId: string, seriesId: number) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'get', seriesId] as const,
  search: (instanceId: string, query: string) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'search', query] as const,
  listBooks: (instanceId: string, seriesId: number) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'listBooks', seriesId] as const,
};

const list = {
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.list(instanceId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('series')
          .where('series.deletedAt', 'is', null)
          .select(['series.id', 'series.name', 'series.createdAt', 'series.updatedAt'])
          .innerJoin('bookSeries', (join) =>
            join
              .onRef('series.id', '=', 'bookSeries.seriesId')
              .on('bookSeries.deletedAt', 'is', null)
          )
          .innerJoin('book', (join) => {
            if (role === 'under18') {
              return join
                .onRef('book.id', '=', 'bookSeries.bookId')
                .on('book.deletedAt', 'is', null)
                .on('book.adultsOnly', '=', 0);
            } else {
              return join
                .onRef('book.id', '=', 'bookSeries.bookId')
                .on('book.deletedAt', 'is', null);
            }
          })
          .select((eb) => [
            eb.fn
              .agg<string>('json_group_array', [
                eb.fn('json_object', [
                  eb.val('id'),
                  eb.ref('book.id'),
                  eb.val('cover'),
                  eb.ref('book.cover'),
                  eb.val('coverThumbhash'),
                  eb.ref('book.coverThumbhash'),
                ]),
              ])
              .orderBy('bookSeries.sort', 'asc')
              .as('books'),
          ])
          .groupBy('series.id')
          .orderBy('series.updatedAt', 'desc');

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          books: JSON.parse(result.books) as Pick<
            Selectable<InstanceDatabase['book']>,
            'id' | 'cover' | 'coverThumbhash'
          >[],
        }));
      },
    });
  },
};

const get = {
  useQuery: (seriesId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.get(instanceId, seriesId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

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

        if (role === 'under18') {
          query = query
            .innerJoin('bookSeries', (join) =>
              join
                .onRef('series.id', '=', 'bookSeries.seriesId')
                .on('bookSeries.deletedAt', 'is', null)
            )
            .innerJoin('book', (join) =>
              join
                .onRef('book.id', '=', 'bookSeries.bookId')
                .on('book.deletedAt', 'is', null)
                .on('book.adultsOnly', '=', 0)
            )
            .groupBy('series.id');
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
      queryKey: seriesQueryKeys.search(instanceId, searchQuery),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('series')
          .where('series.deletedAt', 'is', null)
          .select(['series.id', 'series.name', 'series.createdAt', 'series.updatedAt'])
          .innerJoin('bookSeries', (join) =>
            join
              .onRef('series.id', '=', 'bookSeries.seriesId')
              .on('bookSeries.deletedAt', 'is', null)
          )
          .innerJoin('book', (join) => {
            if (role === 'under18') {
              return join
                .onRef('book.id', '=', 'bookSeries.bookId')
                .on('book.deletedAt', 'is', null)
                .on('book.adultsOnly', '=', 0);
            } else {
              return join
                .onRef('book.id', '=', 'bookSeries.bookId')
                .on('book.deletedAt', 'is', null);
            }
          })
          .select((eb) => [
            eb.fn
              .agg<string>('json_group_array', [
                eb.fn('json_object', [
                  eb.val('id'),
                  eb.ref('book.id'),
                  eb.val('cover'),
                  eb.ref('book.cover'),
                  eb.val('coverThumbhash'),
                  eb.ref('book.coverThumbhash'),
                ]),
              ])
              .orderBy('bookSeries.sort', 'asc')
              .as('books'),
          ])
          .groupBy('series.id');

        if (searchQuery.length > 0) {
          query = query
            .innerJoin('seriesFTS', (join) =>
              join
                .on('seriesFTS.name', 'match', searchQuery)
                .onRef('series.id', '=', 'seriesFTS.rowid')
            )
            // the better the match, the smaller the value
            .orderBy('seriesFTS.rank', 'asc');
        }

        query = query.orderBy('series.updatedAt', 'desc');

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          books: JSON.parse(result.books) as Pick<
            Selectable<InstanceDatabase['book']>,
            'id' | 'cover' | 'coverThumbhash'
          >[],
        }));
      },
    });
  },
};

const listBooks = {
  useQuery: (seriesId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.listBooks(instanceId, seriesId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let authorSubquery = instanceDb
          .selectFrom('bookAuthor')
          .innerJoin('author', (join) =>
            join.onRef('author.id', '=', 'bookAuthor.authorId').on('author.deletedAt', 'is', null)
          )
          .where('bookAuthor.deletedAt', 'is', null)
          .select((eb) => [
            'bookAuthor.bookId',
            eb
              .fn<string>('json_group_array', [
                eb.fn<string>('json_object', [
                  eb.val('id'),
                  eb.ref('author.id'),
                  eb.val('name'),
                  eb.ref('author.name'),
                ]),
              ])
              .as('authors'),
          ])
          .groupBy('bookAuthor.bookId')
          .as('authorData');

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
          .leftJoin(authorSubquery, (join) => join.onRef('book.id', '=', 'authorData.bookId'))
          .leftJoin('audiobookFile', (join) =>
            join
              .onRef('audiobookFile.bookId', '=', 'book.id')
              .on('audiobookFile.deletedAt', 'is', null)
          )
          .leftJoin('latestPlaybackPosition', (join) =>
            join.onRef('latestPlaybackPosition.bookId', '=', 'book.id')
          )
          .groupBy('book.id')
          .orderBy('searchSeries.sort', 'asc')
          .select((eb) => [
            'book.id',
            'book.title',
            'book.cover',
            'book.coverThumbhash',
            'searchSeries.sort',
            'searchSeries.label',
            'authorData.authors',
            eb.fn
              .coalesce(eb.fn.sum<number | null>('audiobookFile.durationMs'), eb.lit(0))
              .as('totalDurationMs'),
            eb.fn.coalesce('latestPlaybackPosition.positionMs', eb.lit(0)).as('playbackPositionMs'),
            eb.fn
              .coalesce('latestPlaybackPosition.eventTimestampMs', eb.lit(0))
              .as('playbackPositionEventTimestampMs'),
          ]);

        if (role === 'under18') {
          query = query.where('book.adultsOnly', '=', 0);
        }

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
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
