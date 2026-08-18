import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';

import { LibraryHandlers } from '#src/groups/library.ts';
import { AdminMiddlewareLayer, AuthMiddlewareLayer, AuthRouterLayer } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';

const AllRoutesLayer = RpcServer.layerHttp({
  group: Api,
  path: '/api/rpc',
  protocol: 'http',
  concurrency: 'unbounded',
}).pipe(
  Layer.provide([
    AuthRouterLayer,
    LibraryHandlers,
    AuthMiddlewareLayer,
    AdminMiddlewareLayer,
    RpcSerialization.layerMsgPack,
  ])
);

if (import.meta.main) {
  const HttpServerLayer = pipe(
    Effect.service(ApiConfig),
    Effect.map((config) => BunHttpServer.layer({ port: config.server.port })),
    Layer.unwrap,
    Layer.provide(ApiConfig.layer)
  );

  const ServerLayer = HttpRouter.serve(AllRoutesLayer).pipe(Layer.provide(HttpServerLayer));

  BunRuntime.runMain(Layer.launch(ServerLayer));
}
