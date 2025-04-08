import { libraryRouter } from '@/router/v1/library';
import { syncRouter } from '@/router/v1/sync';

import { createTRPCRouter } from '@/trpc';

export const v1Router = createTRPCRouter({
  library: libraryRouter,
  sync: syncRouter,
});
