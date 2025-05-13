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
