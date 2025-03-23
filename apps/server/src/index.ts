import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';

import { appRouter } from '@/router/root';

import { auth } from '@/libs/auth/auth';

import { env } from '@/env';
import { logger } from '@/logger';
import { createTRPCContext } from '@/trpc';

const app = new Hono()
  .use(async (c, next) => {
    logger.info({ dir: '-->', method: c.req.method, path: c.req.path });
    await next();
    logger.info({ dir: '<--', status: c.res.status, method: c.req.method, path: c.req.path });
  })
  .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .use(
    '/api/trpc/*',
    trpcServer({
      endpoint: '/api/trpc',
      router: appRouter,
      createContext: createTRPCContext,
    })
  );

export default {
  port: env.PORT,
  fetch: app.fetch,
};
