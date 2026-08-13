import { BunHttpServer, BunPath, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';

import { LibraryHandlers } from '#src/groups/library.ts';
import {
  AdminMiddlewareLayer,
  Auth,
  AuthMiddlewareLayer,
  AuthRouterLayer,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

export const AllRoutesLayerNoDeps = RpcServer.layerHttp({
  group: Api,
  path: '/api/rpc',
  protocol: 'http',
  concurrency: 'unbounded',
}).pipe(
  Layer.provide([AuthRouterLayer, LibraryHandlers, AuthMiddlewareLayer, AdminMiddlewareLayer]),
  Layer.provide(Auth.layerNoDeps),
  Layer.provide(Database.layerNoDeps),
  Layer.provide([RpcSerialization.layerMsgPack, BunPath.layer])
);

const AllRoutesLayer = AllRoutesLayerNoDeps.pipe(Layer.provide(ApiConfig.layer));

if (import.meta.main) {
  const HttpServerLayer = pipe(
    Effect.service(ApiConfig),
    Effect.map((config) => BunHttpServer.layer({ port: config.server.port })),
    Layer.unwrap
  );

  const ServerLayer = HttpRouter.serve(AllRoutesLayer).pipe(
    Layer.provide(HttpServerLayer),
    Layer.provide(ApiConfig.layer)
  );

  BunRuntime.runMain(Layer.launch(ServerLayer));
}
