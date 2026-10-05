import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayer } from '#src/groups/library.ts';
import { AdminMiddlewareLayer, AuthMiddlewareLayer, AuthRouterLayer } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { LibrarySyncRouterLayer } from '#src/services/database/library/sync.ts';

const AllRoutesLayer = Layer.mergeAll(
  AuthRouterLayer,
  LibrarySyncRouterLayer,
  HttpApiBuilder.layer(Api).pipe(
    Layer.provide(LibraryHandlersLayer),
    Layer.provide([AuthMiddlewareLayer, AdminMiddlewareLayer])
  )
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
