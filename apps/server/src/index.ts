import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { Api } from '@repo/spec-api';

import { Auth, AuthMiddlewareLive, AuthRouterLive } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';

const HttpServerLive = Layer.effect(
  HttpServer.HttpServer,
  Effect.service(ApiConfig).pipe(
    Effect.flatMap((config) => BunHttpServer.make({ port: config.server.port }))
  )
);

const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthRouterLive)),
  Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLive)),
  Layer.provideMerge(Layer.mergeAll(Auth.layer))
);

const ServerLive = HttpRouter.serve(ApiLive).pipe(
  Layer.provide(Layer.mergeAll(HttpServerLive, HttpServer.layerServices)),
  Layer.provideMerge(Layer.mergeAll(ApiConfig.layer))
);

BunRuntime.runMain(Layer.launch(ServerLive));
