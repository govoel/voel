import { Effect, Layer, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import type { HttpServerRequest } from 'effect/unstable/http';

import { AuthServerClient } from '@repo/auth-api/server.ts';

import { AuthLayer } from '#src/services/auth.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';

/** Authenticated, read-only Turso Sync routes for the client-safe libraries database. */
export const LibrariesSyncRouterLayerNoDeps = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const auth = yield* AuthServerClient;
    const database = yield* LibraryDatabase;
    const syncRouter = router.prefixed('/api/sync/libraries');

    const handleSyncRequest = Effect.fnUntraced(function* (
      request: HttpServerRequest.HttpServerRequest
    ) {
      const session = yield* auth.api.getSession({ headers: request.headers }).pipe(Effect.orDie);

      if (Option.isNone(session)) {
        return HttpServerResponse.empty({ status: 401 });
      }

      return yield* database.syncHandler(request);
    });

    yield* syncRouter.add('OPTIONS', '/pull-updates', (request) =>
      handleSyncRequest(request).pipe(Effect.orDie)
    );
    yield* syncRouter.add('POST', '/pull-updates', (request) =>
      handleSyncRequest(request).pipe(Effect.orDie)
    );
  })
);

export const LibrariesSyncRouterLayer = LibrariesSyncRouterLayerNoDeps.pipe(
  Layer.provide([AuthLayer, LibraryDatabase.layer])
);
