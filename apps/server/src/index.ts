import { BunHttpServer, BunPath, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';

import { LibraryHandlers } from '#src/groups/library.ts';
import {
  AdminMiddlewareLive,
  Auth,
  AuthMiddlewareLive,
  AuthRouterLive,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

export const AllRoutes = RpcServer.layerHttp({
  group: Api,
  path: '/api/rpc',
  protocol: 'http',
  concurrency: 'unbounded',
}).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthRouterLive, LibraryHandlers)),
  Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLive, AdminMiddlewareLive)),
  Layer.provideMerge(Layer.mergeAll(Auth.layer)),
  Layer.provideMerge(Layer.mergeAll(Database.layer)),
  Layer.provideMerge(Layer.mergeAll(RpcSerialization.layerMsgPack, BunPath.layer))
);

if (import.meta.main) {
  const HttpServerLive = pipe(
    Effect.service(ApiConfig),
    Effect.map((config) => BunHttpServer.layer({ port: config.server.port })),
    Layer.unwrap
  );

  const ServerLive = HttpRouter.serve(AllRoutes).pipe(
    Layer.provide(Layer.mergeAll(HttpServerLive)),
    Layer.provideMerge(Layer.mergeAll(ApiConfig.layer))
  );

  BunRuntime.runMain(Layer.launch(ServerLive));
}
