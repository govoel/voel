import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer, pipe } from 'effect';
import { HttpRouter } from 'effect/http';

import { ApiRoutesLayer } from '#src/groups/index.ts';
import { AuthRouterLayer } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { LibrarySyncRouterLayer } from '#src/services/database/library/sync.ts';

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
