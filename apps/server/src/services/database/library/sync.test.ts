/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer } from 'effect';
import { HttpBody, HttpClient, HttpRouter, HttpServer } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AuthClient } from '@repo/auth-api/client.ts';
import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { AuthLayerNoDeps, AuthRouterLayerNoDeps } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { LibrarySyncRouterLayerNoDeps } from '#src/services/database/library/sync.ts';

const TestServerLayer = HttpRouter.serve(
  Layer.mergeAll(AuthRouterLayerNoDeps, LibrarySyncRouterLayerNoDeps),
  { disableLogger: true, disableListenLog: true }
).pipe(
  Layer.provide(AuthLayerNoDeps),
  Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
  Layer.provide(ApiConfig.layerTest()),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(BunHttpServer.layerTest)
);

it.effect(
  'serves read-only library sync requests authenticated with a bearer token',
  Effect.fnUntraced(
    function* () {
      const server = yield* HttpServer.HttpServer;
      const baseURL = HttpServer.formatAddress(server.address);
      const source = yield* LibraryDatabase;
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped();

      const unauthorized = yield* HttpClient.post('/api/sync/library/pull-updates');
      expect(unauthorized.status).toBe(401);

      const auth = yield* AuthClient.make({ baseURL, plugins: [] });
      const { token } = yield* auth.signUp.email({
        name: 'Sync User',
        username: 'syncuser',
        email: 'sync@example.com',
        password: 'password',
      });
      const headers = { authorization: `Bearer ${token}` };
      yield* source`
        insert into
          library (type, name)
        values
          ('audiobook', 'Audiobooks')
      `;
      const replica = yield* TursoSyncClient.make({
        path: `${directory}/replica.db`,
        url: `${baseURL}/api/sync/library`,
        authToken: Effect.succeed(token),
        longPollTimeoutMs: 10,
      });
      expect(
        yield* replica`
        select
          name
        from
          library
      `
      ).toEqual([{ name: 'Audiobooks' }]);

      yield* source`
        insert into
          library (type, name)
        values
          ('movie', 'Movies')
      `;
      expect(yield* replica.pull).toBe(true);
      expect(
        yield* replica`
        select
          name
        from
          library
        order by
          name
      `
      ).toEqual([{ name: 'Audiobooks' }, { name: 'Movies' }]);

      const options = yield* HttpClient.options('/api/sync/library/pull-updates', { headers });
      expect(options.status).toBe(204);

      const pipeline = yield* HttpClient.post('/api/sync/library/v2/pipeline', {
        headers,
        body: HttpBody.jsonUnsafe({
          requests: [{ type: 'execute', stmt: { sql: 'DELETE FROM library' } }],
        }),
      });
      expect(pipeline.status).toBe(404);
      expect(
        yield* source`
        select
          name
        from
          library
        order by
          name
      `
      ).toEqual([{ name: 'Audiobooks' }, { name: 'Movies' }]);

      const unknownOptions = yield* HttpClient.options('/api/sync/library/future-sync-route', {
        headers,
      });
      expect(unknownOptions.status).toBe(404);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);
