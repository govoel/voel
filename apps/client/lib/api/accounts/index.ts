import {
  useQuery as useReactQuery,
  useMutation as useReactQueryMutation,
} from '@tanstack/react-query';
import { Insertable } from 'kysely';

import { mainDb } from '~/db/client';
import { MainDatabase } from '~/db/schema/main';

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
          .select(['instanceID', 'instanceURL', 'userID', 'username', 'email', 'name', 'image'])
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
            'instanceID as instanceID',
            'instanceURL as instanceURL',
            'userID as userID',
            'username as username',
            'email as email',
            'name as name',
            'image as image',
          ])
          .execute(),
    });
  },
};

export { list, add };
