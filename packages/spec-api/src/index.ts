import { RpcGroup } from 'effect/unstable/rpc';

import { LibraryRpcs } from '#src/groups/library.ts';
import { AuthMiddleware } from '#src/middlewares/auth.ts';

export const Api = RpcGroup.make().merge(LibraryRpcs).middleware(AuthMiddleware);

type ApiHandler<Tag extends RpcGroup.Rpcs<typeof Api>['_tag']> = RpcGroup.HandlerFrom<
  RpcGroup.Rpcs<typeof Api>,
  Tag
>;

export type ApiPayload<Tag extends RpcGroup.Rpcs<typeof Api>['_tag']> = Parameters<
  ApiHandler<Tag>
>[0];
