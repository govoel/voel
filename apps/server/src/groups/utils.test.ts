/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option, Schema } from 'effect';
import { Headers as EffectHeaders } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';
import { RpcTest } from 'effect/unstable/rpc';

import { LibraryRpcs } from '@repo/spec-api/groups/library.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import {
  LibraryHandlersLayerNoDeps,
  LibraryPathRepository,
  LibraryRepository,
} from '#src/groups/library.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';

class AuthUserRow extends Schema.Class<AuthUserRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthUserRow'
)({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  username: Schema.String,
  role: Schema.Literals(['admin', 'user', 'under18']),
}) {
  public static readonly decodeUnknownArraySync = Schema.decodeUnknownSync(Schema.Array(this));
}

class AuthSessionRow extends Schema.Class<AuthSessionRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthSessionRow'
)({
  id: Schema.String,
  token: Schema.String,
  userId: Schema.String,
}) {
  public static readonly decodeUnknownArraySync = Schema.decodeUnknownSync(Schema.Array(this));
}

class AuthUserIdRow extends Schema.Class<AuthUserIdRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthUserIdRow'
)({
  id: AuthUserRow.fields.id,
}) {
  public static readonly decodeUnknownArraySync = Schema.decodeUnknownSync(Schema.Array(this));
}

class AuthSessionIdRow extends Schema.Class<AuthSessionIdRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/AuthSessionIdRow'
)({
  id: AuthSessionRow.fields.id,
}) {
  public static readonly decodeUnknownArraySync = Schema.decodeUnknownSync(Schema.Array(this));
}

class UserRoleRow extends Schema.Class<UserRoleRow, { readonly brand: unique symbol }>(
  '@repo/server/groups/utils.test/UserRoleRow'
)({
  username: AuthUserRow.fields.username,
  role: AuthUserRow.fields.role,
}) {
  public static readonly decodeUnknownArraySync = Schema.decodeUnknownSync(Schema.Array(this));
}

const makeTestLayer = () =>
  LibraryHandlersLayerNoDeps.pipe(
    Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps)),
    Layer.provideMerge(AuthLayerNoDeps),
    Layer.provide([LibraryRepository.layerNoDeps, LibraryPathRepository.layerNoDeps]),
    Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
    Layer.provide([ApiConfig.layerTest(), BunPath.layer, Reactivity.layer])
  );

it.layer(makeTestLayer())('groups utils', (iit) => {
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

      const users = yield* Effect.sync(() =>
        AuthUserRow.decodeUnknownArraySync(
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

      const sessions = yield* Effect.sync(() =>
        AuthSessionRow.decodeUnknownArraySync(
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

          const users = yield* Effect.sync(() =>
            AuthUserIdRow.decodeUnknownArraySync(
              database
                .prepare('select "id" from "user" where "username" = ?')
                .all(['utils_library_cleanup'])
            )
          );
          expect(users).toHaveLength(1);
          userId = users[0]?.id ?? '';

          const sessions = yield* Effect.sync(() =>
            AuthSessionIdRow.decodeUnknownArraySync(
              database.prepare('select "id" from "session" where "userId" = ?').all([userId])
            )
          );
          expect(sessions).toHaveLength(1);
        })
      );

      const users = yield* Effect.sync(() =>
        AuthUserIdRow.decodeUnknownArraySync(
          database.prepare('select "id" from "user" where "id" = ?').all([userId])
        )
      );
      const sessions = yield* Effect.sync(() =>
        AuthSessionIdRow.decodeUnknownArraySync(
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

      const existingUsers = yield* Effect.sync(() =>
        AuthUserIdRow.decodeUnknownArraySync(database.prepare('select "id" from "user"').all())
      );
      expect(existingUsers).toEqual([]);

      yield* makeAuthedClient({ username: 'utils_library_first_user', role: 'user' });

      const users = yield* Effect.sync(() =>
        UserRoleRow.decodeUnknownArraySync(
          database
            .prepare('select "username", "role" from "user" where "username" = ?')
            .all(['utils_library_first_user'])
        )
      );

      expect(users).toEqual([{ username: 'utils_library_first_user', role: 'user' }]);
    })
  );
});

it.layer(makeTestLayer())('groups utils headers', (iit) => {
  iit.effect(
    'makeAuthedClient sends the generated auth headers to the server',
    Effect.fnUntraced(function* () {
      let capturedHeaders = Option.none<EffectHeaders.Headers>();

      const client = yield* RpcTest.makeClient(LibraryRpcs).pipe(
        Effect.provide(
          Layer.mergeAll(
            yield* makeAuthedClient({ username: 'utils_library_headers', role: 'admin' }),
            Layer.effect(
              AuthMiddleware,
              Effect.gen(function* () {
                const realAuthMiddleware = yield* AuthMiddleware;

                return AuthMiddleware.of(
                  Effect.fnUntraced(function* (httpEffect, options) {
                    capturedHeaders = Option.some(options.headers);

                    return yield* realAuthMiddleware(httpEffect, options);
                  })
                );
              })
            )
          )
        )
      );

      yield* client.libraryList({ cursor: Option.none(), limit: 1 });

      const cookie = EffectHeaders.get(Option.getOrThrow(capturedHeaders), 'cookie');
      expect(Option.getOrUndefined(cookie)).toContain('auth.session_token=');
    })
  );
});
