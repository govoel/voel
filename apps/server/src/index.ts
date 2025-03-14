import { Elysia } from 'elysia';

import { env } from './env';
import betterAuthView from './libs/auth/auth-view';

export const app = new Elysia()
  .get('/', () => 'Hello Elysia')
  .all('/api/auth/*', betterAuthView)
  .listen(env.PORT);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
