/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, FileSystem, Layer, Option, Redacted, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { FetchHttpClient, Headers } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { RpcClient, RpcMiddleware, RpcSerialization } from 'effect/unstable/rpc';

import { Api } from '@repo/spec-api';
import { MediaType } from '@repo/spec-api/database/schema.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { AccountManager, ActiveAccountKey } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppConfig } from '#src/services/config.ts';
import { LibraryDatabase, acquireLibraryDatabase } from '#src/services/database/library/index.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import { makeClientTestLayers, makeServerUrl, makeUsername } from '#src/services/testing/utils.ts';

// Each test owns real main and replica files, closed before their directory is removed.
const ClientTestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'voel-library-test-' });
    return makeClientTestLayers({
      config: {
        LIBRARY_DB_FILENAME_SUFFIX: `${directory}/library`,
        MAIN_DB_FILENAME: `${directory}/main.db`,
      },
    });
  })
).pipe(Layer.provideMerge(BunFileSystem.layer));

// Seed and mutate the catalog through authenticated RPCs on the real server.
const setupLibrary = Effect.fnUntraced(function* (name: string) {
  const serverUrl = yield* makeServerUrl;
  const username = yield* makeUsername('library.sync');
  const accounts = yield* AccountManager;
  yield* accounts.setupServerWithAccount({
    serverUrl,
    name: 'Library Sync',
    email: `${username}@voel.app`,
    username,
    password: Redacted.make('password'),
  });
  const account = Option.getOrThrow(yield* accounts.state);
  const authentication = yield* acquireAuthClient(account);
  const cookie = Option.getOrThrow(yield* authentication.getCookie);
  const rpc = yield* RpcClient.make(Api).pipe(
    Effect.provide([
      RpcClient.layerProtocolHttp({ url: `${serverUrl}/api/rpc` }).pipe(
        Layer.provide([
          FetchHttpClient.layer,
          RpcSerialization.layerSchemaBinary({ fingerprintPayloads: true }),
        ])
      ),
      RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
        next({ ...request, headers: Headers.set(request.headers, 'cookie', cookie) })
      ),
    ])
  );
  const createLibrary = (libraryName: string) =>
    rpc.libraryUpsert({
      id: Option.none(),
      name: libraryName,
      type: MediaType.fields.type.make('audiobook'),
      absolutePaths: [],
    });
  yield* createLibrary(name);
  return { createLibrary, account };
});

const libraryNames = (database: LibraryDatabase['Service']) =>
  database<{ readonly name: string }>`
    select
      name
    from
      library
    order by
      name
  `;

it.layer(TestServerControllerClient.layer)('library database', (iit) => {
  iit.effect(
    'bootstraps a file-backed catalog and rejects local data and schema writes, including after reopening',
    Effect.fnUntraced(
      function* () {
        const { account } = yield* setupLibrary('Audiobooks');
        const config = yield* AppConfig;
        const fs = yield* FileSystem.FileSystem;
        const filename = `${config.libraryDb.filenameSuffix}-${account.authStorageId}.db`;

        const checkReplica = Effect.gen(function* () {
          const database = yield* LibraryDatabase.make(account);
          expect(yield* fs.exists(filename)).toBe(true);
          expect(yield* libraryNames(database)).toEqual([{ name: 'Audiobooks' }]);
          expect(yield* database`pragma query_only`).toEqual([{ query_only: 1 }]);
          expect(yield* database`pragma foreign_keys`).toEqual([{ foreign_keys: 1 }]);

          for (const statement of [
            database`
              insert into
                library (type, name)
              values
                ('movie', 'Local')
            `,
            database`
              update library
              set
                name = 'Local'
            `,
            database`
              delete from library
            `,
            database`create table local_only (id integer primary key)`,
          ]) {
            const error = yield* statement.pipe(Effect.flip);
            expect(String(error.reason.cause)).toContain(
              'Cannot execute write statement in query_only mode'
            );
          }
          expect(yield* libraryNames(database)).toEqual([{ name: 'Audiobooks' }]);
        }).pipe(Effect.scoped);

        yield* checkReplica;
        yield* checkReplica;
      },
      (effect) => effect.pipe(Effect.provide(ClientTestLayer))
    )
  );

  iit.effect(
    'reactively publishes subsequent server changes after acquisition',
    Effect.fnUntraced(
      function* () {
        const { createLibrary, account } = yield* setupLibrary('Audiobooks');
        const database = yield* acquireLibraryDatabase(account);
        const subscribed = yield* Deferred.make<true>();
        const changes = yield* libraryNames(database).pipe(
          Reactivity.stream(['library']),
          Stream.tap(() => Deferred.succeed(subscribed, true)),
          Stream.filter((rows) => rows.some((row) => row.name === 'Movies')),
          Stream.runHead,
          Effect.forkChild
        );
        yield* Deferred.await(subscribed);
        yield* createLibrary('Movies');
        yield* TestClock.adjust('1 second');

        expect(
          Option.getOrThrow(
            yield* Fiber.join(changes).pipe(Effect.timeout('10 seconds'), TestClock.withLive)
          )
        ).toEqual([{ name: 'Audiobooks' }, { name: 'Movies' }]);
        expect(yield* database`pragma query_only`).toEqual([{ query_only: 1 }]);
      },
      (effect) => effect.pipe(Effect.provide(ClientTestLayer))
    )
  );

  iit.effect(
    'shares a scoped replica by account identity, isolates servers, and reopens persisted replicas',
    Effect.fnUntraced(
      function* () {
        const first = yield* setupLibrary('First server');
        const second = yield* setupLibrary('Second server');
        const config = yield* AppConfig;
        const fs = yield* FileSystem.FileSystem;

        const idle = yield* Effect.gen(function* () {
          const firstDatabase = yield* acquireLibraryDatabase(first.account);
          const reused = yield* acquireLibraryDatabase(new ActiveAccountKey(first.account));
          const secondDatabase = yield* acquireLibraryDatabase(second.account);
          expect(reused).toBe(firstDatabase);
          expect(secondDatabase).not.toBe(firstDatabase);
          expect(yield* libraryNames(firstDatabase)).toEqual([{ name: 'First server' }]);
          expect(yield* libraryNames(secondDatabase)).toEqual([{ name: 'Second server' }]);
          return firstDatabase;
        }).pipe(Effect.scoped);

        for (const { account } of [first, second]) {
          expect(
            yield* fs.exists(`${config.libraryDb.filenameSuffix}-${account.authStorageId}.db`)
          ).toBe(true);
        }
        yield* TestClock.adjust('1 minute');
        const retained = yield* acquireLibraryDatabase(first.account).pipe(Effect.scoped);
        expect(retained).toBe(idle);

        yield* TestClock.adjust('5 minutes');
        const reopened = yield* acquireLibraryDatabase(first.account);
        expect(reopened).not.toBe(idle);
        expect(yield* libraryNames(reopened)).toEqual([{ name: 'First server' }]);
      },
      (effect) => effect.pipe(Effect.provide(ClientTestLayer))
    )
  );

  iit.effect(
    'suspends pulling after sign-out while retaining the readable local catalog',
    Effect.fnUntraced(
      function* () {
        const { account, createLibrary } = yield* setupLibrary('Audiobooks');
        const database = yield* LibraryDatabase.make(account);
        expect(yield* libraryNames(database)).toEqual([{ name: 'Audiobooks' }]);
        yield* createLibrary('Movies');
        yield* AccountManager.use((accounts) => accounts.removeActiveAccount);

        const pull = yield* database.pull.pipe(Effect.forkScoped({ startImmediately: true }));
        expect(yield* libraryNames(database)).toEqual([{ name: 'Audiobooks' }]);
        expect(pull.pollUnsafe()).toBe(void 0);
      },
      (effect) => effect.pipe(Effect.provide(ClientTestLayer))
    )
  );
});
