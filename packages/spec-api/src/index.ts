import { RpcGroup } from 'effect/unstable/rpc';

import { AuthMiddleware } from '#src/auth.ts';
import { Library } from '#src/library.ts';

export const Api = RpcGroup.make().merge(Library).middleware(AuthMiddleware);
