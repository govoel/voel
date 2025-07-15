import { useQuery as useReactQuery } from '@tanstack/react-query';
import type { Selectable } from 'kysely';

import { mainDb } from '~/db/client';
import type { BookContributorTable, InstanceDatabase } from '~/db/schema/instance';

import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';

export const bookContributorQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'bookContributor'] as const,
  listBooks: (instanceId: string, role: Selectable<BookContributorTable>['role'], name: string) =>
    ['instance', instanceId, 'bookContributor', 'listBooks', role, name] as const,
  search: (instanceId: string, role: Selectable<BookContributorTable>['role'], query: string) =>
    ['instance', instanceId, 'bookContributor', 'search', role, query] as const,
};

const listBooks = {
  useQuery: (
    contributorRole: Selectable<BookContributorTable>['role'],
    contributorName: string
  ) => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: bookContributorQueryKeys.listBooks(instanceId, contributorRole, contributorName),
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
          .innerJoin('bookContributor as searchContributor', (join) =>
            join
              .on('searchContributor.deletedAt', 'is', null)
              .on('searchContributor.role', '=', contributorRole)
              .on('searchContributor.name', '=', contributorName)
              .onRef('book.id', '=', 'searchContributor.bookId')
          )
          .leftJoin('bookContributor', (join) =>
            join
              .on('bookContributor.deletedAt', 'is', null)
              .on('bookContributor.role', '=', contributorRole)
              .onRef('book.id', '=', 'bookContributor.bookId')
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
                  eb.ref('bookContributor.id'),
                  eb.val('name'),
                  eb.ref('bookContributor.name'),
                ]),
              ])
              .as('contributors'),
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
          contributors: JSON.parse(result.contributors) as Pick<
            Selectable<InstanceDatabase['bookContributor']>,
            'name'
          >[],
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
        const { role = 'under18' } = await mainDb
          .selectFrom('accounts')
          .select(['role'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow();

        let query = instanceDb
          .selectFrom('bookContributor')
          .where('bookContributor.role', '=', contributorRole)
          .where('bookContributor.deletedAt', 'is', null)
          .select(['bookContributor.id', 'bookContributor.name'])
          .select((eb) => [eb.fn.count<number>('bookContributor.bookId').as('bookCount')])
          .groupBy('bookContributor.name');

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
          .orderBy('bookContributor.updatedAt', 'desc')
          .orderBy('bookContributor.id', 'asc');

        return await query.execute();
      },
    });
  },
};

export { listBooks, search };
