import { RpcGroup } from 'effect/unstable/rpc';

import { Library } from '#src/groups/library.ts';
import { AuthMiddleware } from '#src/middlewares/auth.ts';

export const Api = RpcGroup.make().merge(Library).middleware(AuthMiddleware);
