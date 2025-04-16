import * as accounts from './accounts';
import * as authors from './authors';
import * as books from './books';
import * as libraries from './libraries';
import * as narrators from './narrators';
import * as series from './series';
import { MutationCache, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.options.mutationKey) {
        if (mutation.options.mutationKey.length > 1) {
          queryClient.invalidateQueries({ queryKey: mutation.options.mutationKey.slice(0, -1) });
        } else if (
          mutation.options.mutationKey.length === 1 &&
          mutation.options.mutationKey[0].length > 1 &&
          mutation.options.mutationKey[0][0] === 'v1'
        ) {
          queryClient.invalidateQueries({
            queryKey: [mutation.options.mutationKey[0].slice(0, -1)],
          });
        }
      }
    },
  }),
});

export default { accounts, authors, books, libraries, narrators, series };
