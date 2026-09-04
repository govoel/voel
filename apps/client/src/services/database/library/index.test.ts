/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, FileSystem, Layer, Option, Redacted } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';

import type { TursoSyncClientOptions } from '@repo/effect-turso-sync';
import { TursoSyncClient as TestTursoSyncClient } from '@repo/effect-turso-sync-bun';

import { ActiveAccountResources } from '#src/services/accounts/active-account-resources.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { TursoSyncClientFactory } from '#src/services/database/factory/index.ts';
import { LibraryDatabaseMap } from '#src/services/database/library/index.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import { makeClientTestLayers, makeServerUrl, makeUsername } from '#src/services/testing/utils.ts';

type LibraryOptions = Omit<TursoSyncClientOptions, 'onConnect'>;

const turso = {
  onPull: null as (() => Effect.Effect<boolean>) | null,
  optionsSeen: [] as Array<LibraryOptions>,
  pragmas: [] as Array<string>,
};

const makeTursoSyncTestClient = Effect.fnUntraced(function* <R = never>(
  options: TursoSyncClientOptions<R>
) {
  const { onConnect, ...observed } = options;
  turso.optionsSeen.push(observed);
  if (onConnect) {
    yield* onConnect({
      exec: (sql) => Effect.sync(() => turso.pragmas.push(sql)),
    });
  }
  const client = yield* TestTursoSyncClient.make({ path: ':memory:' });
  return Object.assign(client, {
    pull: turso.onPull ? Effect.as(turso.onPull(), false) : Effect.succeed(false),
  });
});

const TursoSyncClientFactoryTestLayer = Layer.succeed(TursoSyncClientFactory, {
  make: makeTursoSyncTestClient,
});

it.layer(TestServerControllerClient.layer)('library database', (iit) => {
  iit.effect(
    'eagerly synchronizes an isolated library.db replica for the active account',
    Effect.fnUntraced(
      function* () {
        turso.optionsSeen.length = 0;
        turso.pragmas.length = 0;
        const firstPull = yield* Deferred.make<true>();
        turso.onPull = () => Deferred.succeed(firstPull, true);

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

        yield* Deferred.await(firstPull);

        expect(turso.optionsSeen).toHaveLength(1);
        const [firstOptions] = turso.optionsSeen;
        const options = Option.getOrThrow(Option.fromNullishOr(firstOptions));
        const url = yield* typeof options.url === 'string'
          ? Effect.succeed(options.url)
          : Effect.die(new Error('Turso did not receive a library URL'));

        expect(options.path).toMatch(/^library\..+\.db$/u);
        expect(options.path).not.toContain('/');
        expect(url).toBe(`${serverUrl}/api/sync/library`);
        expect(options.bootstrapIfEmpty).toBe(true);
        expect(options.longPollTimeoutMs).toBe(30_000);

        expect(turso.pragmas).toEqual(['PRAGMA foreign_keys = ON', 'PRAGMA query_only = ON']);

        const provideToken = yield* typeof options.authToken === 'function'
          ? Effect.succeed(options.authToken)
          : Effect.die(new Error('Turso did not receive an auth token provider'));
        const token = yield* Effect.promise(async () => provideToken());
        const response = yield* HttpClient.options(`${url}/pull-updates`, {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(204);

        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped();
        const replica = yield* TestTursoSyncClient.make({
          path: `${directory}/library.db`,
          url,
          authToken: provideToken,
        });
        const tables = yield* replica<{ readonly name: string }>`
          select
            name
          from
            sqlite_schema
          where
            type = 'table'
            and name = 'library'
        `;
        expect(tables).toEqual([{ name: 'library' }]);
      },
      (effect) =>
        effect.pipe(
          Effect.scoped,
          Effect.provide([
            ActiveAccountResources.layerNoDeps.pipe(
              Layer.provideMerge(
                LibraryDatabaseMap.layerNoDeps.pipe(
                  Layer.provide(TursoSyncClientFactoryTestLayer),
                  Layer.provideMerge(
                    makeClientTestLayers({
                      config: {
                        LIBRARY_DB_FILENAME: 'library.db',
                        MAIN_DB_FILENAME: ':memory:',
                      },
                    })
                  )
                )
              )
            ),
            BunFileSystem.layer,
            FetchHttpClient.layer,
          ])
        )
    )
  );
});
