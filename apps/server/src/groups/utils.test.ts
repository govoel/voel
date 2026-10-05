/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Layer, Option, Schema } from 'effect';
import { Headers, HttpEffect, HttpRouter, HttpServerResponse } from 'effect/http';
import { HttpApiTest } from 'effect/http-api';
import { Reactivity } from 'effect/reactivity';

import { Api } from '@repo/spec-api';
import { Library } from '@repo/spec-api/database/schema.ts';

import { ApiRoutesLayerNoDeps } from '#src/groups/index.ts';
import { LibraryHandlersLayerNoDeps, LibraryRepository } from '#src/groups/library.ts';
import { makeAuthedClient, makeRawRequest } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import {
  StoragePluginBuilder,
  StoragePluginMap,
  StoragePluginModuleMap,
  StoragePluginSettingsMap,
} from '#src/services/plugins/storage/index.ts';

class AuthUserRow extends Schema.Class<AuthUserRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthUserRow'
)({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  username: Schema.String,
  role: Schema.Literals(['admin', 'user', 'under18']),
}) {
  public static readonly decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(this));
}

class AuthSessionRow extends Schema.Class<AuthSessionRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthSessionRow'
)({
  id: Schema.String,
  token: Schema.String,
  userId: Schema.String,
}) {
  public static readonly decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(this));
}

class AuthUserIdRow extends Schema.Class<AuthUserIdRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthUserIdRow'
)({
  id: AuthUserRow.fields.id,
}) {
  public static readonly decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(this));
}

class AuthSessionIdRow extends Schema.Class<AuthSessionIdRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthSessionIdRow'
)({
  id: AuthSessionRow.fields.id,
}) {
  public static readonly decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(this));
}

class UserRoleRow extends Schema.Class<UserRoleRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/UserRoleRow'
)({
  username: AuthUserRow.fields.username,
  role: AuthUserRow.fields.role,
}) {
  public static readonly decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(this));
}

const requestContextProbeLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const settingsMap = yield* StoragePluginSettingsMap;
    const pluginMap = yield* StoragePluginMap;

    // Raw router handlers do not capture construction context like HttpApiBuilder.group.
    // Optional lookups make omitted request provisioning an explicit identity mismatch.
    yield* router.add(
      'GET',
      '/__test/request-maps',
      Effect.gen(function* () {
        const requestSettingsMap = yield* Effect.serviceOption(StoragePluginSettingsMap);
        const requestPluginMap = yield* Effect.serviceOption(StoragePluginMap);
        return HttpServerResponse.jsonUnsafe({
          sameSettingsMap: Option.exists(requestSettingsMap, (map) => map === settingsMap),
          samePluginMap: Option.exists(requestPluginMap, (map) => map === pluginMap),
        });
      })
    );
  })
);

const makeTestDependenciesLayer = () =>
  Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps).pipe(
    Layer.provideMerge(AuthLayerNoDeps),
    Layer.provideMerge([
      LibraryRepository.layerNoDeps,
      StoragePluginModuleMap.layer,
      StoragePluginBuilder.layer,
      StoragePluginSettingsMap.layer,
      StoragePluginMap.layer,
    ]),
    Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
    Layer.provide([ApiConfig.layerTest(), Reactivity.layer]),
    Layer.provideMerge(BunHttpServer.layerHttpServices)
  );

const makeTestLayer = () =>
  Layer.mergeAll(ApiRoutesLayerNoDeps, requestContextProbeLayer).pipe(
    HttpRouter.provideRequest(
      Layer.mergeAll(StoragePluginSettingsMap.layer, StoragePluginMap.layer)
    ),
    Layer.provideMerge(makeTestDependenciesLayer()),
    Layer.provideMerge(HttpRouter.layer)
  );

it.effect(
  'raw requests reject already-aborted signals without invoking the handler',
  Effect.fnUntraced(function* () {
    let invoked = false;
    const send = makeRawRequest({
      headers: Headers.empty,
      handler: async () => {
        invoked = true;
        return new Response();
      },
    });
    const result = yield* send({ path: '/', signal: AbortSignal.abort() }).pipe(Effect.exit);
    expect(Exit.isFailure(result)).toBe(true);
    expect(invoked).toBe(false);
  })
);

it.layer(makeTestLayer())('groups utils', (iit) => {
  iit.effect(
    'injects the construction maps into the HTTP request context',
    Effect.fnUntraced(function* () {
      const handler = HttpEffect.toWebHandler(yield* HttpRouter.toHttpEffect(Layer.empty));
      const response = yield* Effect.promise(async () =>
        handler(new Request('http://localhost/__test/request-maps'))
      );

      expect(response.status).toBe(200);
      expect(yield* Effect.promise(async () => response.json())).toEqual({
        sameSettingsMap: true,
        samePluginMap: true,
      });
    })
  );

  iit.effect(
    'makeAuthedClient creates the expected auth rows',
    Effect.fnUntraced(function* () {
      const database = yield* AuthDatabase;

      yield* makeAuthedClient({
        username: 'utils_library_admin',
        role: 'admin',
        email: 'utils_library_admin@example.test',
        name: 'Utils Library Admin',
      });

      const users = yield* Effect.suspend(() =>
        AuthUserRow.decodeUnknownArray(
          database
            .prepare(
              'select "id", "name", "email", "username", "role" from "user" where "username" = ?'
            )
            .all(['utils_library_admin'])
        )
      );

      expect(users).toHaveLength(1);
      const [user] = users;
      expect(user?.id).toBeTypeOf('string');
      expect(user?.name).toBe('Utils Library Admin');
      expect(user?.email).toBe('utils_library_admin@example.test');
      expect(user?.username).toBe('utils_library_admin');
      expect(user?.role).toBe('admin');

      const sessions = yield* Effect.suspend(() =>
        AuthSessionRow.decodeUnknownArray(
          database
            .prepare('select "id", "token", "userId" from "session" where "userId" = ?')
            .all([user?.id ?? ''])
        )
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBeTypeOf('string');
      expect(sessions[0]?.token).toBeTypeOf('string');
      expect(sessions[0]?.userId).toBe(user?.id);
    })
  );

  iit.effect(
    'makeAuthedClient cleans up the auth rows when its scope closes',
    Effect.fnUntraced(function* () {
      const database = yield* AuthDatabase;
      let userId = '';

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* makeAuthedClient({ username: 'utils_library_cleanup', role: 'admin' });

          const users = yield* Effect.suspend(() =>
            AuthUserIdRow.decodeUnknownArray(
              database
                .prepare('select "id" from "user" where "username" = ?')
                .all(['utils_library_cleanup'])
            )
          );
          expect(users).toHaveLength(1);
          userId = users[0]?.id ?? '';

          const sessions = yield* Effect.suspend(() =>
            AuthSessionIdRow.decodeUnknownArray(
              database.prepare('select "id" from "session" where "userId" = ?').all([userId])
            )
          );
          expect(sessions).toHaveLength(1);
        })
      );

      const users = yield* Effect.suspend(() =>
        AuthUserIdRow.decodeUnknownArray(
          database.prepare('select "id" from "user" where "id" = ?').all([userId])
        )
      );
      const sessions = yield* Effect.suspend(() =>
        AuthSessionIdRow.decodeUnknownArray(
          database.prepare('select "id" from "session" where "userId" = ?').all([userId])
        )
      );
      expect(users).toEqual([]);
      expect(sessions).toEqual([]);
    })
  );

  iit.effect(
    'makeAuthedClient does not preserve first-user-is-admin behavior',
    Effect.fnUntraced(function* () {
      const database = yield* AuthDatabase;

      const existingUsers = yield* Effect.suspend(() =>
        AuthUserIdRow.decodeUnknownArray(database.prepare('select "id" from "user"').all())
      );
      expect(existingUsers).toEqual([]);

      yield* makeAuthedClient({ username: 'utils_library_first_user', role: 'user' });

      const users = yield* Effect.suspend(() =>
        UserRoleRow.decodeUnknownArray(
          database
            .prepare('select "username", "role" from "user" where "username" = ?')
            .all(['utils_library_first_user'])
        )
      );

      expect(users).toEqual([{ username: 'utils_library_first_user', role: 'user' }]);
    })
  );
});

class TestClient extends Context.Service<TestClient>()(
  '@repo/server/groups/utils.test/TestClient',
  { make: HttpApiTest.groups(Api, ['library']) }
) {}

// Register the test client's routes under request middleware using the fixture's existing maps.
const testClientLayer = Layer.effect(TestClient, TestClient.make).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps),
  HttpRouter.provideRequest(
    Layer.effectContext(
      Effect.context<StoragePluginMap | StoragePluginSettingsMap>().pipe(
        Effect.map(Context.pick(StoragePluginMap, StoragePluginSettingsMap))
      )
    )
  )
);

it.layer(makeTestDependenciesLayer())('groups utils headers', (iit) => {
  iit.effect(
    'makeAuthedClient authenticates admin library requests',
    Effect.fnUntraced(function* () {
      const auth = yield* makeAuthedClient({ username: 'utils_library_headers', role: 'admin' });
      // Keep the handlers' retirement scope alive until the enclosing test scope closes.
      const client = yield* Layer.build(testClientLayer.pipe(Layer.provide(auth.layer))).pipe(
        Effect.map(Context.get(TestClient))
      );
      const library = yield* client.library.create({
        payload: {
          name: Library.fields.name.make('Authenticated library'),
          type: Library.fields.type.make('movie'),
          storagePlugin: Library.fields.storagePlugin.make('builtin:local'),
        },
      });
      expect(yield* client.library.get({ params: library })).toMatchObject({
        name: 'Authenticated library',
        type: 'movie',
        storagePlugin: 'builtin:local',
        storagePluginHealth: { status: 'unknown' },
      });
    })
  );
});
