import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer } from 'effect';
import { HttpBody, HttpClient, HttpRouter, HttpServer } from 'effect/http';
import { Reactivity } from 'effect/reactivity';

import { AuthClient, createAuthClient } from '@repo/auth-api/client.ts';
import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { ApiConfig } from '#src/config.ts';
import { AuthDatabase } from '#src/domains/auth/database/index.ts';
import { AuthLayerNoDeps, AuthRouterLayerNoDeps } from '#src/domains/auth/http.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibrarySyncRouterLayerNoDeps } from '#src/domains/library/database/sync.ts';

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

      const auth = yield* AuthClient.make({
        createClient: () => createAuthClient({ baseURL, plugins: [] }),
      });
      const { token } = yield* auth.signUp.email({
        name: 'Sync User',
        username: 'syncuser',
        email: 'sync@example.com',
        password: 'password',
      });
      const headers = { authorization: `Bearer ${token}` };
      yield* source`
        insert into
          library (type, name, "storagePluginId")
        values
          ('audiobook', 'Audiobooks', 'builtin:local')
      `;
      const replica = yield* TursoSyncClient.make({
        path: `${directory}/replica.db`,
        url: `${baseURL}/api/sync/library`,
        authToken: Effect.succeed(token),
        longPollTimeoutMs: 10,
      });
      const rows = yield* replica`
        select
          name
        from
          library
      `;
      expect(rows).toEqual([{ name: 'Audiobooks' }]);

      yield* source`
        insert into
          library (type, name, "storagePluginId")
        values
          ('movie', 'Movies', 'builtin:local')
      `;
      const pull = yield* replica.pull;
      expect(pull).toBe(true);
      const rows2 = yield* replica`
        select
          name
        from
          library
        order by
          name
      `;
      expect(rows2).toEqual([{ name: 'Audiobooks' }, { name: 'Movies' }]);

      const options = yield* HttpClient.options('/api/sync/library/pull-updates', { headers });
      expect(options.status).toBe(204);

      const pipeline = yield* HttpClient.post('/api/sync/library/v2/pipeline', {
        headers,
        body: HttpBody.jsonUnsafe({
          requests: [{ type: 'execute', stmt: { sql: 'DELETE FROM library' } }],
        }),
      });
      expect(pipeline.status).toBe(404);
      const rows3 = yield* source`
        select
          name
        from
          library
        order by
          name
      `;
      expect(rows3).toEqual([{ name: 'Audiobooks' }, { name: 'Movies' }]);

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
      const pull2 = yield* replica.pull;
      expect(pull2).toBe(true);
      const rows4 = yield* replica`
        select
          root
        from
          "libraryRoot"
      `;
      expect(rows4).toEqual([{ root: '/audiobooks' }]);
      const rows5 = yield* replica`
        select
          l.name, f.location, m."matchFailureReason", m."customOrder"
        from
          "libraryFileMap" m
          left join library l on l.id = m."libraryId"
          left join "mediaFile" f on f.id = m."mediaFileId"
        order by l.name
      `;
      expect(rows5).toEqual([
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
      const pull3 = yield* replica.pull;
      expect(pull3).toBe(true);
      const rows6 = yield* replica`
        select
          name
        from
          library
      `;
      expect(rows6).toEqual([{ name: 'Movies' }]);
      const rows7 = yield* replica`
        select
          id
        from
          "libraryRoot"
      `;
      expect(rows7).toEqual([]);
      const rows8 = yield* replica`
        select
          l.name, f.location, m."matchFailureReason", m."customOrder"
        from
          "libraryFileMap" m
          left join library l on l.id = m."libraryId"
          left join "mediaFile" f on f.id = m."mediaFileId"
        order by l.name
      `;
      expect(rows8).toEqual([
        {
          name: 'Movies',
          location: '/shared-book',
          matchFailureReason: 'unmatched',
          customOrder: 0,
        },
      ]);
      const rows9 = yield* replica`
        select
          location
        from
          "mediaFile"
      `;
      expect(rows9).toEqual([{ location: '/shared-book' }]);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);
