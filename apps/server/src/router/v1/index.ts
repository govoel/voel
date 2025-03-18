import { libraryRouter } from '@/router/v1/library';

import { createTRPCRouter } from '@/trpc';

export const v1Router = createTRPCRouter({
  library: libraryRouter,
});
