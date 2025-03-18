import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { appRouter } from '@/router/root';

import { auth } from '@/libs/auth/auth';

import { env } from '@/env';

const app = new Hono()
  .use(logger())
  .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .use(
    '/api/trpc/*',
    trpcServer({
      endpoint: '/api/trpc',
      router: appRouter,
    })
  );

export default {
  port: env.PORT,
  fetch: app.fetch,
};
