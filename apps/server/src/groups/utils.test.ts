import { BunPath } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import { Effect, Layer, Option } from 'effect';
import { Headers as EffectHeaders } from 'effect/unstable/http';

import { sql } from '@repo/source-tap';
import { AuthMiddleware, CurrentSession, Unauthorized } from '@repo/spec-api/middlewares/auth.ts';

import { LibraryHandlers } from '#src/groups/library.ts';
import { makeAuthedClient } from '#src/groups/utils.ts';
import { AdminMiddlewareLive, Auth, AuthMiddlewareLive } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

const makeTestLayer = () =>
  LibraryHandlers.pipe(
    Layer.provideMerge(Layer.mergeAll(AdminMiddlewareLive)),
    Layer.provideMerge(Layer.mergeAll(Auth.layer)),
    Layer.provideMerge(Database.layerTest({ filename: ':memory:' })),
    Layer.provideMerge(BunPath.layer),
    Layer.provideMerge(ApiConfig.layerTest())
  );

it.layer(makeTestLayer())('groups utils', (iit) => {
  iit.effect(
    'makeLibraryClient creates the expected auth rows',
    Effect.fnUntraced(function* () {
      const { db } = yield* Database;

      yield* makeAuthedClient({
        username: 'utils-library-admin',
        role: 'admin',
        email: 'utils-library-admin@example.test',
        name: 'Utils Library Admin',
      }).pipe(Effect.provide(AuthMiddlewareLive));

      const users = yield* db.executeRaw(
        sql<{
          readonly id: string;
          readonly name: string;
          readonly email: string;
          readonly username: string;
          readonly role: string;
        }>`select id, name, email, username, role from "user" where username = ${'utils-library-admin'}`
      );

      expect(users.rows).toHaveLength(1);
      const [user] = users.rows;
      expect(user?.id).toBeTypeOf('string');
      expect(user?.name).toBe('Utils Library Admin');
      expect(user?.email).toBe('utils-library-admin@example.test');
      expect(user?.username).toBe('utils-library-admin');
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
          yield* makeAuthedClient({ username: 'utils-library-cleanup', role: 'admin' }).pipe(
            Effect.provide(AuthMiddlewareLive)
          );

          const users = yield* db.executeRaw(
            sql<{
              readonly id: string;
            }>`select id from "user" where username = ${'utils-library-cleanup'}`
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

      yield* makeAuthedClient({ username: 'utils-library-first-user', role: 'user' }).pipe(
        Effect.provide(AuthMiddlewareLive)
      );

      const users = yield* db.executeRaw(
        sql<{
          readonly username: string;
          readonly role: string;
        }>`select username, role from "user" where username = ${'utils-library-first-user'}`
      );

      expect(users.rows).toEqual([{ username: 'utils-library-first-user', role: 'user' }]);
    })
  );
});

it.layer(makeTestLayer())('groups utils headers', (iit) => {
  iit.effect(
    'makeLibraryClient sends the generated auth headers to the server',
    Effect.fnUntraced(function* () {
      let capturedHeaders = Option.none<EffectHeaders.Headers>();

      const client = yield* makeAuthedClient({
        username: 'utils-library-headers',
        role: 'admin',
      }).pipe(
        Effect.provide(
          Layer.effect(
            AuthMiddleware,
            Effect.gen(function* () {
              const auth = yield* Auth;

              return AuthMiddleware.of(
                Effect.fnUntraced(function* (httpEffect, { headers }) {
                  capturedHeaders = Option.some(headers);

                  const session = yield* Effect.tryPromise({
                    try: async () => auth.api.getSession({ headers }),
                    catch: () => new Unauthorized({}),
                  });

                  if (session === null) {
                    return yield* new Unauthorized({});
                  }

                  return yield* Effect.provideService(httpEffect, CurrentSession, session);
                })
              );
            })
          )
        )
      );

      yield* client.libraryList({ cursor: Option.none(), limit: 1 });

      const cookie = EffectHeaders.get(Option.getOrThrow(capturedHeaders), 'cookie');
      expect(Option.getOrUndefined(cookie)).toContain('auth.session_token=');
    })
  );
});
