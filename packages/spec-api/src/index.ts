import { RpcGroup } from 'effect/unstable/rpc';

import { AuthMiddleware } from '#src/auth.ts';

export const Api = RpcGroup.make().middleware(AuthMiddleware);
