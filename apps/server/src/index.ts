import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';

import { appRouter } from '@/router/root';
import { handler as fileHandler } from '@/router/v1/files';

import { auth } from '@/libs/auth/auth';
import { migrator } from '@/libs/db/migrator';

import { env } from '@/env';
import { logger } from '@/logger';
import { createTRPCContext } from '@/trpc';

if (process.env.NODE_ENV === 'production') {
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((i) => {
    if (i.status === 'Success') {
      logger.info(`Migration ${i.migrationName} succeeded`);
    } else {
      logger.error(`Migration ${i.migrationName} failed`);
    }
  });

  if (error) {
    logger.error(`Migration failed with error: ${error}`);
    process.exit(1);
  }
}

const app = new Hono()
  .use(async (c, next) => {
    logger.info({ dir: '>>', method: c.req.method, path: c.req.path });
    await next();
    logger.info({ dir: '<<', status: c.res.status, method: c.req.method, path: c.req.path });
  })
  .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  .use(
    '/api/trpc/*',
    trpcServer({
      endpoint: '/api/trpc',
      router: appRouter,
      createContext: createTRPCContext,
    })
  )
  .get('/api/v1/files/:id', async (c) => fileHandler(c));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
