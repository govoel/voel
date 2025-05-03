import { useQuery as useReactQuery } from '@tanstack/react-query';
import { Kysely } from 'kysely';

import type { InstanceDatabase } from '~/db/schema/instance';

const list = {
  queryKey: ['instance', 'library', 'list'],
  useQuery: (instanceDb: Kysely<InstanceDatabase>) => {
    return useReactQuery({
      queryKey: list.queryKey,
      networkMode: 'always',
      queryFn: async () =>
        instanceDb
          .selectFrom('library')
          .where('library.deletedAt', 'is', null)
          .select(['library.id', 'library.name', 'library.createdAt', 'library.updatedAt'])
          .execute(),
    });
  },
};

export { list };
