import { HttpApi } from 'effect/unstable/httpapi';

import { AuthMiddleware } from '#src/auth.ts';

export const Api = HttpApi.make('Api').middleware(AuthMiddleware).prefix('/api');

export { AuthMiddleware, CurrentSession } from '#src/auth.ts';
