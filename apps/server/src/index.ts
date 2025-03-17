import { Hono } from 'hono';
import { logger } from 'hono/logger';

import { auth } from '@/libs/auth/auth';

import { env } from '@/env';

const app = new Hono()
  .use(logger())
  .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
