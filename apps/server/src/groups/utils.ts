import { Effect } from 'effect';
import { Headers as EffectHeaders } from 'effect/unstable/http';
import { RpcMiddleware, RpcTest } from 'effect/unstable/rpc';

import type { TestHelpers } from '@repo/auth-api/server.ts';
import { sql } from '@repo/effect-kysely';
import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { Auth } from '#src/services/auth.ts';
import { Database } from '#src/services/database/index.ts';

const isTestHelpers = (value: unknown): value is TestHelpers =>
  typeof value === 'object' &&
  value !== null &&
  'createUser' in value &&
  'saveUser' in value &&
  'deleteUser' in value &&
  'getAuthHeaders' in value;

export const makeAuthedClient = Effect.fnUntraced(function* (user: {
  readonly username: string;
  readonly role: 'admin' | 'user' | 'under18';
  readonly email?: string;
  readonly name?: string;
}) {
  const auth = yield* Auth;
  const { db } = yield* Database;
  const context = yield* Effect.tryPromise(async () => auth.$context).pipe(Effect.orDie);

  if (!('test' in context) || !isTestHelpers(context.test)) {
    return yield* Effect.die(new Error('Auth test helpers are unavailable'));
  }

  const { test } = context;
  const savedUser = yield* Effect.tryPromise(async () =>
    test.saveUser(
      test.createUser({
        role: user.role,
        username: user.username,
        email: user.email ?? `${user.username}@test.localhost`,
        name: user.name ?? `Test User: ${user.username}`,
      })
    )
  ).pipe(Effect.orDie);

  yield* db.executeRaw(sql`update "user" set "role" = ${user.role} where "id" = ${savedUser.id}`);

  yield* Effect.addFinalizer(() =>
    Effect.tryPromise(async () => test.deleteUser(savedUser.id)).pipe(Effect.orDie)
  );

  const headers = yield* Effect.tryPromise(async () =>
    test.getAuthHeaders({ userId: savedUser.id })
  ).pipe(Effect.orDie, Effect.map(EffectHeaders.fromInput));

  return yield* RpcTest.makeClient(Api).pipe(
    Effect.provide(
      RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
        next({ ...request, headers: EffectHeaders.merge(request.headers, headers) })
      )
    )
  );
});
