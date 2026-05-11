import { RpcGroup } from 'effect/unstable/rpc';

import { library } from '#src/groups/library.ts';
import { AuthMiddleware } from '#src/middlewares/auth.ts';

export const Api = RpcGroup.make(...library).middleware(AuthMiddleware);
