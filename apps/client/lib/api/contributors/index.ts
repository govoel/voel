import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, type Selectable } from 'kysely';

import type { BookContributorTable, InstanceDatabase } from '~/db/schema/instance';

const getBooks = {
  queryKey: ['instance', 'bookContributor', 'getBooks'],
  useQuery: (
    instanceDb: Kysely<InstanceDatabase>,
    contributorName: string,
    contributorRole: Selectable<BookContributorTable>['role']
  ) => {
    return useReactQuery({
      queryKey: [...getBooks.queryKey, { name: contributorName, role: contributorRole }],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
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
                    eb.ref('bookContributor.id'),
                    eb.val('name'),
                    eb.ref('bookContributor.name'),
                  ]),
                ])
                .as('contributors'),
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

export { getBooks };
