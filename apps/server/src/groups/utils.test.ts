/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Exit, Layer, Schema } from 'effect';
import { Headers, HttpEffect, HttpRouter } from 'effect/http';

import { Library } from '@repo/spec-api/database/schema.ts';

import { ApiRoutesLayerNoDeps } from '#src/groups/index.ts';
import { makeAuthedClient, makeRawRequest } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { librariesTestLayer } from '#src/services/libraries/test-fixture.ts';

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

const testLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps).pipe(
      Layer.provideMerge(AuthLayerNoDeps),
      Layer.provideMerge(AuthDatabase.layerNoDeps)
    )
  ),
  Layer.provideMerge(librariesTestLayer),
  Layer.provideMerge(BunHttpServer.layerHttpServices),
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

it.layer(testLayer)('groups utils', (iit) => {
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

it.layer(testLayer)('groups utils headers', (iit) => {
  iit.effect(
    'makeAuthedClient authenticates admin library requests',
    Effect.fnUntraced(function* () {
      const auth = yield* makeAuthedClient({ username: 'utils_library_headers', role: 'admin' });
      const handler = HttpEffect.toWebHandler(yield* HttpRouter.toHttpEffect(Layer.empty));
      const send = makeRawRequest({ handler, headers: auth.headers });
      const created = yield* send({
        path: '/api/libraries',
        method: 'POST',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          name: 'Authenticated library',
          type: 'movie',
          storagePlugin: 'builtin:local',
        }),
      });
      expect(created.status).toBe(200);
      const library = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ id: Library.json.fields.id })
      )(yield* Effect.promise(async () => created.json()));
      const response = yield* send({ path: `/api/libraries/${library.id}`, method: 'GET' });
      expect(response.status).toBe(200);
      expect(yield* Effect.promise(async () => response.json())).toMatchObject({
        name: 'Authenticated library',
        type: 'movie',
        storagePlugin: 'builtin:local',
        storagePluginHealth: { status: 'unknown' },
      });
    })
  );
});
