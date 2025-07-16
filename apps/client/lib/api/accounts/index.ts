import { useQuery as useReactQuery } from '@tanstack/react-query';

import { mainDb } from '~/lib/db/client';

export const accountsQueryKeys = {
  all: ['accounts'] as const,
  list: () => [...accountsQueryKeys.all, 'list'] as const,
  get: (instanceId: string) => [...accountsQueryKeys.all, 'get', instanceId] as const,
};

const list = {
  useQuery: () =>
    useReactQuery({
      queryKey: accountsQueryKeys.list(),
      networkMode: 'always',
      refetchOnReconnect: true,
      queryFn: () =>
        mainDb
          .selectFrom('accounts')
          .select([
            'instanceId',
            'instanceURL',
            'userId',
            'username',
            'email',
            'name',
            'image',
            'role',
            'updatedAt',
          ])
          .execute(),
    }),
};

const get = {
  useQuery: (instanceId: string) =>
    useReactQuery({
      queryKey: accountsQueryKeys.get(instanceId),
      networkMode: 'always',
      refetchOnReconnect: true,
      queryFn: () =>
        mainDb
          .selectFrom('accounts')
          .select([
            'instanceId',
            'instanceURL',
            'userId',
            'username',
            'email',
            'name',
            'image',
            'role',
            'updatedAt',
          ])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow(),
    }),
};

export { list, get };
