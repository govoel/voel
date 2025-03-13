import * as accounts from './accounts';
import { MutationCache, QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.options.mutationKey && mutation.options.mutationKey.length > 1) {
        queryClient.invalidateQueries({ queryKey: mutation.options.mutationKey.slice(0, -1) });
      }
    },
  }),
});

export default { accounts };
