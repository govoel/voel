import { useQuery as useReactQuery } from '@tanstack/react-query';

import { useInstanceDb, useInstanceId } from '~/lib/stores/instance';

export const librariesQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'library'] as const,
  list: (instanceId: string) => ['instance', instanceId, 'library', 'list'] as const,
};

const list = {
  useQuery: () => {
    const instanceDb = useInstanceDb();
    const instanceId = useInstanceId();

    return useReactQuery({
      queryKey: librariesQueryKeys.list(instanceId),
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
