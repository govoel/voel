import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely, Selectable } from 'kysely';

import { InstanceDatabase } from '~/db/schema/instance';

const getBooks = {
  queryKey: ['instance', 'bookContributor', 'getBooks'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>, narratorName: string) => {
    return useReactQuery({
      queryKey: [...getBooks.queryKey, narratorName],
      networkMode: 'always',
      queryFn: async () => {
        let query = instanceDb
          .selectFrom('book')
          .where('book.deletedAt', 'is', null)
          .innerJoin('bookContributor as searchNarrator', (join) =>
            join
              .on('searchNarrator.deletedAt', 'is', null)
              .on('searchNarrator.role', '=', 'narrator')
              .on('searchNarrator.name', '=', narratorName)
              .onRef('book.id', '=', 'searchNarrator.bookId')
          )
          .leftJoin('bookContributor', (join) =>
            join
              .on('bookContributor.deletedAt', 'is', null)
              .on('bookContributor.role', '=', 'narrator')
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
                .as('narrators'),
          ]);

        const results = await query.execute();

        return results.map((result) => ({
          ...result,
          narrators: JSON.parse(result.narrators) as Pick<
            Selectable<InstanceDatabase['bookContributor']>,
            'name'
          >[],
        }));
      },
    });
  },
};

export { getBooks };
