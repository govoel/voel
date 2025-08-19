import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import type { InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

export const seriesQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'series'] as const,
  list: (instanceId: string) => [...seriesQueryKeys.all(instanceId), 'series', 'list'] as const,
  getById: (instanceId: string, seriesId: number) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'getById', seriesId] as const,
  search: (instanceId: string, query: string) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'search', query] as const,
  listBooksById: (instanceId: string, seriesId: number) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'listBooksById', seriesId] as const,
  listBooksByName: (instanceId: string, seriesName: string) =>
    [...seriesQueryKeys.all(instanceId), 'series', 'listBooksByName', seriesName] as const,
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
          .selectFrom('bookSeries')
          .where('bookSeries.deletedAt', 'is', null)
          .leftJoin('series', (join) =>
            join.onRef('series.id', '=', 'bookSeries.seriesId').on('series.deletedAt', 'is', null)
          )
          .select((eb) => [
            'bookSeries.id',
            'bookSeries.seriesId',
            eb.fn.coalesce('series.name', 'bookSeries.title').as('name'),
          ])
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
          .groupBy((eb) => eb.fn.coalesce('bookSeries.seriesId', 'bookSeries.title'))
          .orderBy((eb) => eb.fn.max('bookSeries.updatedAt'), 'desc');

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

const getById = {
  useQuery: (seriesId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.getById(instanceId, seriesId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('series')
          .where('series.id', '=', seriesId)
          .where('series.deletedAt', 'is', null)
          .select(['series.id', 'series.name', 'series.summary']);

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

const listBooksById = {
  useQuery: (seriesId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.listBooksById(instanceId, seriesId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('searchSeries', (eb) =>
            eb
              .selectFrom('bookSeries')
              .select(['bookSeries.bookId', 'bookSeries.sort', 'bookSeries.label'])
              .where('bookSeries.seriesId', '=', seriesId)
              .where('bookSeries.deletedAt', 'is', null)
          )
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookContributor')
              .where('bookContributor.role', '=', 'author')
              .where('bookContributor.deletedAt', 'is', null)
              .innerJoin('searchSeries', (join) =>
                join.onRef('bookContributor.bookId', '=', 'searchSeries.bookId')
              )
              .select((eb) => [
                'bookContributor.bookId',
                'searchSeries.label',
                'searchSeries.sort',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn<string>('json_object', [eb.val('name'), 'bookContributor.name']),
                  ])
                  .as('authors'),
              ])
              .groupBy('bookContributor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('searchSeries', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'searchSeries.bookId')
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
            join.onRef('latestPlaybackPosition.bookId', '=', 'book.id')
          )
          .orderBy('authorsArray.sort', 'asc')
          .select((eb) => [
            'book.id',
            'book.title',
            'book.cover',
            'book.coverThumbhash',
            'authorsArray.sort',
            'authorsArray.label',
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
                Selectable<InstanceDatabase['bookContributor']>,
                'name'
              >[])
            : [],
        }));
      },
    });
  },
};

const listBooksByName = {
  useQuery: (seriesName: string) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: seriesQueryKeys.listBooksByName(instanceId, seriesName),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('searchSeries', (eb) =>
            eb
              .selectFrom('bookSeries')
              .select('bookSeries.bookId')
              .where('bookSeries.title', '=', seriesName)
              .where('bookSeries.deletedAt', 'is', null)
          )
          .with('authorsArray', (eb) =>
            eb
              .selectFrom('bookContributor')
              .where('bookContributor.role', '=', 'author')
              .where('bookContributor.deletedAt', 'is', null)
              .innerJoin('searchSeries', (join) =>
                join.onRef('bookContributor.bookId', '=', 'searchSeries.bookId')
              )
              .select((eb) => [
                'bookContributor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn('json_object', [eb.val('name'), eb.ref('bookContributor.name')]),
                  ])
                  .as('authors'),
              ])
              .groupBy('bookContributor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('searchSeries', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'searchSeries.bookId')
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
                Selectable<InstanceDatabase['bookContributor']>,
                'name'
              >[])
            : [],
        }));
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
          .selectFrom('bookSeries')
          .where('bookSeries.deletedAt', 'is', null)
          .leftJoin('series', (join) =>
            join
              .onRef('series.id', '=', 'bookSeries.seriesId')
              .on('bookSeries.deletedAt', 'is', null)
          )
          .select((eb) => [
            'bookSeries.id',
            'bookSeries.seriesId',
            eb.fn.coalesce('series.name', 'bookSeries.title').as('name'),
          ])
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
          .groupBy((eb) => eb.fn.coalesce('bookSeries.seriesId', 'bookSeries.title'));

        if (searchQuery.length > 0) {
          query = query
            .innerJoin('bookSeriesFTS', (join) =>
              join
                .on('bookSeriesFTS.title', 'match', searchQuery)
                .onRef('bookSeries.id', '=', 'bookSeriesFTS.rowid')
            )
            // the better the match, the smaller the value
            .orderBy('bookSeriesFTS.rank', 'asc');
        }

        query = query
          .orderBy((eb) => eb.fn.max('bookSeries.updatedAt'), 'desc')
          .orderBy('bookSeries.id', 'asc');

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

export { list, getById, listBooksById, listBooksByName, search };
