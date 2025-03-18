import { v1Router } from '@/router/v1';

import { createTRPCRouter } from '@/trpc';

export const appRouter = createTRPCRouter({
  v1: v1Router,
});

export type AppRouter = typeof appRouter;
