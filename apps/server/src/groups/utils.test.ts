/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import { Headers as EffectHeaders } from 'effect/unstable/http';
import { RpcTest } from 'effect/unstable/rpc';

import { AuthServerClient } from '@repo/auth-api/server.ts';
import { sql } from '@repo/effect-kysely';
import { LibraryRpcs } from '@repo/spec-api/groups/library.ts';
import {
  AuthMiddleware,
  CurrentSession,
  UnauthorizedError,
} from '@repo/spec-api/middlewares/auth.ts';

import { LibraryHandlersNoDeps } from '#src/groups/library.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

const makeTestLayer = () =>
  LibraryHandlersNoDeps.pipe(
    Layer.provideMerge(Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps)),
    Layer.provideMerge(AuthLayerNoDeps),
    Layer.provideMerge(Database.layerNoDeps),
    Layer.provideMerge(BunPath.layer),
    Layer.provideMerge(ApiConfig.layerTest())
  );

it.layer(makeTestLayer())('groups utils', (iit) => {
  iit.effect(
    'makeLibraryClient creates the expected auth rows',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;

      yield* makeAuthedClient({
        username: 'utils_library_admin',
        role: 'admin',
        email: 'utils_library_admin@example.test',
        name: 'Utils Library Admin',
      }).pipe(Effect.provide(AuthMiddlewareLayerNoDeps));

      const users = yield* db.executeRaw(
        sql<{
          readonly id: string;
          readonly name: string;
          readonly email: string;
          readonly username: string;
          readonly role: string;
        }>`select id, name, email, username, role from "user" where username = ${'utils_library_admin'}`
      );

      expect(users.rows).toHaveLength(1);
      const [user] = users.rows;
      expect(user?.id).toBeTypeOf('string');
      expect(user?.name).toBe('Utils Library Admin');
      expect(user?.email).toBe('utils_library_admin@example.test');
      expect(user?.username).toBe('utils_library_admin');
      expect(user?.role).toBe('admin');

      const sessions = yield* db.executeRaw(
        sql<{
          readonly id: string;
          readonly token: string;
          readonly userId: string;
        }>`select id, token, userId from "session" where userId = ${user?.id}`
      );

      expect(sessions.rows).toHaveLength(1);
      expect(sessions.rows[0]?.id).toBeTypeOf('string');
      expect(sessions.rows[0]?.token).toBeTypeOf('string');
      expect(sessions.rows[0]?.userId).toBe(user?.id);
    })
  );

  iit.effect(
    'makeLibraryClient cleans up the auth rows when its scope closes',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;
      let userId = '';

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* makeAuthedClient({ username: 'utils_library_cleanup', role: 'admin' }).pipe(
            Effect.provide(AuthMiddlewareLayerNoDeps)
          );

          const users = yield* db.executeRaw(
            sql<{
              readonly id: string;
            }>`select id from "user" where username = ${'utils_library_cleanup'}`
          );
          expect(users.rows).toHaveLength(1);
          userId = users.rows[0]?.id ?? '';

          const sessions = yield* db.executeRaw(
            sql<{
              readonly id: string;
            }>`select id from "session" where userId = ${userId}`
          );
          expect(sessions.rows).toHaveLength(1);
        })
      );

      const users = yield* db.executeRaw(
        sql<{ readonly id: string }>`select id from "user" where id = ${userId}`
      );
      const sessions = yield* db.executeRaw(
        sql<{
          readonly id: string;
        }>`select id from "session" where userId = ${userId}`
      );
      expect(users.rows).toEqual([]);
      expect(sessions.rows).toEqual([]);
    })
  );

  iit.effect(
    'makeLibraryClient does not preserve first-user-is-admin behavior',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;

      const existingUsers = yield* db.executeRaw(
        sql<{ readonly id: string }>`select id from "user"`
      );
      expect(existingUsers.rows).toEqual([]);

      yield* makeAuthedClient({ username: 'utils_library_first_user', role: 'user' }).pipe(
        Effect.provide(AuthMiddlewareLayerNoDeps)
      );

      const users = yield* db.executeRaw(
        sql<{
          readonly username: string;
          readonly role: string;
        }>`select username, role from "user" where username = ${'utils_library_first_user'}`
      );

      expect(users.rows).toEqual([{ username: 'utils_library_first_user', role: 'user' }]);
    })
  );
});

it.layer(makeTestLayer())('groups utils headers', (iit) => {
  iit.effect(
    'makeLibraryClient sends the generated auth headers to the server',
    Effect.fnUntraced(function* () {
      let capturedHeaders = Option.none<EffectHeaders.Headers>();

      const authLayer = yield* makeAuthedClient({
        username: 'utils_library_headers',
        role: 'admin',
      });
      const authMiddlewareLayer = Layer.effect(
        AuthMiddleware,
        Effect.gen(function* () {
          const auth = yield* AuthServerClient;

          return AuthMiddleware.of(
            Effect.fnUntraced(function* (httpEffect, { headers }) {
              capturedHeaders = Option.some(headers);

              const session = yield* auth.api
                .getSession({ headers })
                .pipe(Effect.catch(() => UnauthorizedError.make({})));

              if (Option.isNone(session)) {
                return yield* UnauthorizedError.make({});
              }

              return yield* Effect.provideService(httpEffect, CurrentSession, session.value);
            })
          );
        })
      );
      const client = yield* RpcTest.makeClient(LibraryRpcs).pipe(
        Effect.provide(Layer.mergeAll(authLayer, authMiddlewareLayer))
      );

      yield* client.libraryList({ cursor: Option.none(), limit: 1 });

      const cookie = EffectHeaders.get(Option.getOrThrow(capturedHeaders), 'cookie');
      expect(Option.getOrUndefined(cookie)).toContain('auth.session_token=');
    })
  );
});
