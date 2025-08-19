import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import type { BookContributorTable, InstanceDatabase } from '~/lib/db/schema/instance';
import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';
import { getRole } from '~/lib/utils';

export const bookContributorQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'bookContributor'] as const,
  getById: (instanceId: string, contributorId: number) =>
    [...bookContributorQueryKeys.all(instanceId), 'getById', contributorId] as const,
  list: (instanceId: string, role: Selectable<BookContributorTable>['role']) =>
    ['instance', instanceId, 'bookContributor', 'list', role] as const,
  listBooksById: (instanceId: string, role: Selectable<BookContributorTable>['role'], id: number) =>
    ['instance', instanceId, 'bookContributor', 'listBooksById', role, id] as const,
  listBooksByName: (
    instanceId: string,
    role: Selectable<BookContributorTable>['role'],
    name: string
  ) => ['instance', instanceId, 'bookContributor', 'listBooksByName', role, name] as const,
  search: (instanceId: string, role: Selectable<BookContributorTable>['role'], query: string) =>
    ['instance', instanceId, 'bookContributor', 'search', role, query] as const,
};

const list = {
  useQuery: (contributorRole: Selectable<BookContributorTable>['role']) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.list(instanceId, contributorRole),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('bookContributor')
          .where('bookContributor.role', '=', contributorRole)
          .where('bookContributor.deletedAt', 'is', null)
          .leftJoin('contributor', (join) =>
            join
              .onRef('contributor.id', '=', 'bookContributor.contributorId')
              .on('contributor.deletedAt', 'is', null)
          )
          .select((eb) => [
            'bookContributor.id',
            'bookContributor.contributorId',
            eb.fn.coalesce('contributor.name', 'bookContributor.name').as('name'),
            'contributor.avatar',
            'contributor.avatarThumbhash',
          ])
          .select((eb) => [eb.fn.count<number>('bookContributor.bookId').as('bookCount')])
          .groupBy((eb) => eb.fn.coalesce('bookContributor.contributorId', 'bookContributor.name'))
          .orderBy((eb) => eb.fn.max('bookContributor.updatedAt'), 'desc');

        if (role === 'under18') {
          query = query.innerJoin('book', (join) =>
            join
              .onRef('book.id', '=', 'bookContributor.bookId')
              .on('book.deletedAt', 'is', null)
              .on('book.adultsOnly', '=', 0)
          );
        }

        return await query.execute();
      },
    });
  },
};

const getById = {
  useQuery: (contributorId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.getById(instanceId, contributorId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('contributor')
          .where('contributor.id', '=', contributorId)
          .where('contributor.deletedAt', 'is', null)
          .select([
            'contributor.id',
            'contributor.name',
            'contributor.avatar',
            'contributor.avatarThumbhash',
            'contributor.about',
          ]);

        if (role === 'under18') {
          query = query
            .innerJoin('bookContributor', (join) =>
              join
                .onRef('contributor.id', '=', 'bookContributor.contributorId')
                .on('bookContributor.deletedAt', 'is', null)
            )
            .innerJoin('book', (join) =>
              join
                .onRef('book.id', '=', 'bookContributor.bookId')
                .on('book.deletedAt', 'is', null)
                .on('book.adultsOnly', '=', 0)
            )
            .groupBy('contributor.id');
        }

        return await query.executeTakeFirstOrThrow();
      },
    });
  },
};

const listBooksById = {
  useQuery: (contributorRole: Selectable<BookContributorTable>['role'], contributorId: number) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.listBooksById(instanceId, contributorRole, contributorId),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('searchContributor', (eb) =>
            eb
              .selectFrom('bookContributor')
              .select('bookContributor.bookId')
              .where('bookContributor.role', '=', contributorRole)
              .where('bookContributor.contributorId', '=', contributorId)
              .where('bookContributor.deletedAt', 'is', null)
          )
          .with('contributorsArray', (eb) =>
            eb
              .selectFrom('bookContributor')
              .where('bookContributor.role', '=', contributorRole)
              .where('bookContributor.deletedAt', 'is', null)
              .innerJoin('searchContributor', (join) =>
                join.onRef('bookContributor.bookId', '=', 'searchContributor.bookId')
              )
              .select((eb) => [
                'bookContributor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn('json_object', [eb.val('name'), eb.ref('bookContributor.name')]),
                  ])
                  .as('contributors'),
              ])
              .groupBy('bookContributor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('searchContributor', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'searchContributor.bookId')
              )
              .select((eb) => [
                'audiobookFile.bookId',
                eb.fn.sum<number | null>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('contributorsArray', (join) =>
            join.onRef('book.id', '=', 'contributorsArray.bookId')
          )
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
            'contributorsArray.contributors',
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
          contributors: result.contributors
            ? (JSON.parse(result.contributors) as Pick<
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
  useQuery: (
    contributorRole: Selectable<BookContributorTable>['role'],
    contributorName: string
  ) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.listBooksByName(
        instanceId,
        contributorRole,
        contributorName
      ),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .with('searchContributor', (eb) =>
            eb
              .selectFrom('bookContributor')
              .select('bookContributor.bookId')
              .where('bookContributor.role', '=', contributorRole)
              .where('bookContributor.name', '=', contributorName)
              .where('bookContributor.deletedAt', 'is', null)
          )
          .with('contributorsArray', (eb) =>
            eb
              .selectFrom('bookContributor')
              .where('bookContributor.role', '=', contributorRole)
              .where('bookContributor.deletedAt', 'is', null)
              .innerJoin('searchContributor', (join) =>
                join.onRef('bookContributor.bookId', '=', 'searchContributor.bookId')
              )
              .select((eb) => [
                'bookContributor.bookId',
                eb.fn
                  .agg<string>('json_group_array', [
                    eb.fn('json_object', [eb.val('name'), eb.ref('bookContributor.name')]),
                  ])
                  .as('contributors'),
              ])
              .groupBy('bookContributor.bookId')
          )
          .with('audiobookFileDurations', (eb) =>
            eb
              .selectFrom('audiobookFile')
              .where('audiobookFile.deletedAt', 'is', null)
              .innerJoin('searchContributor', (join) =>
                join.onRef('audiobookFile.bookId', '=', 'searchContributor.bookId')
              )
              .select((eb) => [
                'audiobookFile.bookId',
                eb.fn.sum<number | null>('audiobookFile.durationMs').as('totalDurationMs'),
              ])
              .groupBy('audiobookFile.bookId')
          )
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('contributorsArray', (join) =>
            join.onRef('book.id', '=', 'contributorsArray.bookId')
          )
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
            'contributorsArray.contributors',
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
          contributors: result.contributors
            ? (JSON.parse(result.contributors) as Pick<
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
  useQuery: (contributorRole: Selectable<BookContributorTable>['role'], searchQuery: string) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.search(instanceId, contributorRole, searchQuery),
      networkMode: 'always',
      queryFn: async () => {
        const role = await getRole(instanceId);

        let query = instanceDb
          .selectFrom('bookContributor')
          .where('bookContributor.role', '=', contributorRole)
          .where('bookContributor.deletedAt', 'is', null)
          .leftJoin('contributor', (join) =>
            join
              .onRef('bookContributor.contributorId', '=', 'contributor.id')
              .on('contributor.deletedAt', 'is', null)
          )
          .select((eb) => [
            'bookContributor.id',
            'bookContributor.contributorId',
            eb.fn.coalesce('contributor.name', 'bookContributor.name').as('name'),
            'contributor.avatar',
            'contributor.avatarThumbhash',
            eb.fn.count<number>('bookContributor.bookId').as('bookCount'),
          ])
          .groupBy((eb) => eb.fn.coalesce('bookContributor.contributorId', 'bookContributor.name'));

        if (searchQuery.length > 0) {
          query = query
            .innerJoin('bookContributorFTS', (join) =>
              join
                .on('bookContributorFTS.name', 'match', searchQuery)
                .on('bookContributor.role', '=', contributorRole)
                .onRef('bookContributor.id', '=', 'bookContributorFTS.rowid')
            )
            // the better the match, the smaller the value
            .orderBy('bookContributorFTS.rank', 'asc');
        }

        if (role === 'under18') {
          query = query.innerJoin('book', (join) =>
            join
              .onRef('book.id', '=', 'bookContributor.bookId')
              .on('book.deletedAt', 'is', null)
              .on('book.adultsOnly', '=', 0)
          );
        }

        query = query
          .orderBy((eb) => eb.fn.max('bookContributor.updatedAt'), 'desc')
          .orderBy('bookContributor.id', 'asc');

        return await query.execute();
      },
    });
  },
};

export { list, getById, listBooksById, listBooksByName, search };
