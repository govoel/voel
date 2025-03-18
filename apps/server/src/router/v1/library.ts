import { z } from 'zod';

import { adminProcedure, createTRPCRouter } from '@/trpc';

export const libraryRouter = createTRPCRouter({
  create: adminProcedure
    .input(z.object({ title: z.string().min(2).max(100) }))
    .mutation(async () => {
      return { ok: true };
    }),
});
