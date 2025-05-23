import {
  useQuery as useReactQuery,
  useMutation as useReactQueryMutation,
} from '@tanstack/react-query';
import type { Insertable } from 'kysely';

import { mainDb } from '~/db/client';
import type { MainDatabase } from '~/db/schema/main';

const list = {
  queryKey: ['accounts', 'list'],
  useQuery: () => {
    return useReactQuery({
      queryKey: list.queryKey,
      networkMode: 'always',
      refetchOnReconnect: true,
      queryFn: () =>
        mainDb
          .selectFrom('accounts')
          .select(['instanceId', 'instanceURL', 'userId', 'username', 'email', 'name', 'image'])
          .execute(),
    });
  },
};

const add = {
  mutationKey: ['accounts'],
  useMutation: () => {
    return useReactQueryMutation({
      mutationKey: add.mutationKey,
      mutationFn: (account: Insertable<MainDatabase['accounts']>) =>
        mainDb
          .insertInto('accounts')
          .values(account)
          .onConflict((oc) => oc.doNothing())
          .returning([
            'instanceId as instanceId',
            'instanceURL as instanceURL',
            'userId as userId',
            'username as username',
            'email as email',
            'name as name',
            'image as image',
          ])
          .execute(),
    });
  },
};

const get = {
  queryKey: ['accounts', 'get'],
  useQuery: (instanceId: string) => {
    return useReactQuery({
      queryKey: [...get.queryKey, instanceId],
      networkMode: 'always',
      refetchOnReconnect: true,
      queryFn: () =>
        mainDb
          .selectFrom('accounts')
          .select(['instanceId', 'instanceURL', 'userId', 'username', 'email', 'name', 'image'])
          .where('instanceId', '=', parseInt(instanceId, 10))
          .executeTakeFirstOrThrow(),
    });
  },
};

export { list, add, get };
