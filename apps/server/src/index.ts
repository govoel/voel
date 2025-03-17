import { Elysia } from 'elysia';

import betterAuthView from '@/libs/auth/auth-view';

import { env } from '@/env';

export const app = new Elysia().all('/api/auth/*', betterAuthView).listen(env.PORT);

console.log(`Server is running at ${app.server?.hostname}:${app.server?.port}`);
