import { BunPath } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpRouter } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AuthClient } from '@repo/auth-api/client.ts';

import { AuthLayerNoDeps, AuthRouterLayerNoDeps } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { LibrariesSyncRouterLayerNoDeps } from '#src/services/database/library/sync.ts';

const TestServerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const routes = Layer.mergeAll(AuthRouterLayerNoDeps, LibrariesSyncRouterLayerNoDeps).pipe(
      Layer.provideMerge(AuthLayerNoDeps),
      Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
      Layer.provide([ApiConfig.layerTest(), BunPath.layer, Reactivity.layer])
    );
    const { handler, dispose } = HttpRouter.toWebHandler(routes);
    yield* Effect.addFinalizer(() => Effect.tryPromise(async () => dispose()));

    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      return handler(request);
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => vi.unstubAllGlobals()));
  })
);

const syncUrl = (path: string) => `http://test/api/sync/libraries${path}`;

it.effect(
  'serves read-only library sync requests authenticated with a bearer token',
  Effect.fnUntraced(
    function* () {
      const unauthorized = yield* HttpClient.options(syncUrl('/pull-updates'));
      expect(unauthorized.status).toBe(401);

      const auth = yield* AuthClient.make({ baseURL: 'http://test/', plugins: [] });
      const { token } = yield* auth.signUp.email({
        name: 'Sync User',
        username: 'syncuser',
        email: 'sync@example.com',
        password: 'password',
      });
      const headers = { authorization: `Bearer ${token}` };

      const options = yield* HttpClient.options(syncUrl('/pull-updates'), { headers });
      expect(options.status).toBe(204);

      const pipeline = yield* HttpClient.post(syncUrl('/v2/pipeline'), { headers });
      expect(pipeline.status).toBe(404);

      const unknownOptions = yield* HttpClient.options(syncUrl('/future-sync-route'), { headers });
      expect(unknownOptions.status).toBe(404);
    },
    (effect) => effect.pipe(Effect.provide([TestServerLayer, FetchHttpClient.layer]))
  )
);
