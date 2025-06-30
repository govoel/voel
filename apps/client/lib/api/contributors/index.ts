import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, type Selectable } from 'kysely';

import type { BookContributorTable, InstanceDatabase } from '~/db/schema/instance';

const listBooks = {
  queryKey: ['instance', 'bookContributor', 'listBooks'],
  useQuery: (
    instanceDb: Kysely<InstanceDatabase>,
    contributorName: string,
    contributorRole: Selectable<BookContributorTable>['role']
  ) => {
    return useReactQuery({
      queryKey: [...listBooks.queryKey, { name: contributorName, role: contributorRole }],
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

export { listBooks };
