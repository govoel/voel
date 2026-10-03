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
          library (type, name, "storagePlugin")
        values
          ('audiobook', 'Audiobooks', 'builtin:local')
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
          library (type, name, "storagePlugin")
        values
          ('movie', 'Movies', 'builtin:local')
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

      yield* source`
        insert into "libraryRoot" ("libraryId", root)
        select id, '/audiobooks' from library where name = 'Audiobooks'
      `;
      yield* source`
        insert into
          "mediaFile" (location, "durationMs")
        values
          ('/shared-book', 100)
      `;
      yield* source`
        insert into "libraryFileMap" ("libraryId", "mediaFileId", "matchFailureReason", "customOrder")
        select l.id, f.id, 'unmatched', 0 from library l cross join "mediaFile" f
      `;
      expect(yield* replica.pull).toBe(true);
      expect(
        yield* replica`
        select
          root
        from
          "libraryRoot"
      `
      ).toEqual([{ root: '/audiobooks' }]);
      expect(
        yield* replica`
        select
          l.name, f.location, m."matchFailureReason", m."customOrder"
        from
          "libraryFileMap" m
          left join library l on l.id = m."libraryId"
          left join "mediaFile" f on f.id = m."mediaFileId"
        order by l.name
      `
      ).toEqual([
        {
          name: 'Audiobooks',
          location: '/shared-book',
          matchFailureReason: 'unmatched',
          customOrder: 0,
        },
        {
          name: 'Movies',
          location: '/shared-book',
          matchFailureReason: 'unmatched',
          customOrder: 0,
        },
      ]);

      yield* source`
        delete from library
        where
          name = 'Audiobooks'
      `;
      expect(yield* replica.pull).toBe(true);
      expect(
        yield* replica`
        select
          name
        from
          library
      `
      ).toEqual([{ name: 'Movies' }]);
      expect(
        yield* replica`
        select
          id
        from
          "libraryRoot"
      `
      ).toEqual([]);
      expect(
        yield* replica`
        select
          l.name, f.location, m."matchFailureReason", m."customOrder"
        from
          "libraryFileMap" m
          left join library l on l.id = m."libraryId"
          left join "mediaFile" f on f.id = m."mediaFileId"
        order by l.name
      `
      ).toEqual([
        {
          name: 'Movies',
          location: '/shared-book',
          matchFailureReason: 'unmatched',
          customOrder: 0,
        },
      ]);
      expect(
        yield* replica`
        select
          location
        from
          "mediaFile"
      `
      ).toEqual([{ location: '/shared-book' }]);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);
