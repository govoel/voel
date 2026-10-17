import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/http';

import { ApiConfig } from '#src/config.ts';
import { AuthRouterLayer } from '#src/domains/auth/http.ts';
import { LibrarySyncRouterLayer } from '#src/domains/library/database/sync.ts';
import { ApiRoutesLayer } from '#src/http.ts';

const AllRoutesLayer = Layer.mergeAll(AuthRouterLayer, LibrarySyncRouterLayer, ApiRoutesLayer);

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
