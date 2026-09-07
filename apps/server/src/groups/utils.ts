import { Effect } from 'effect';
import { Headers as EffectHeaders } from 'effect/unstable/http';
import { RpcMiddleware } from 'effect/unstable/rpc';

import { AuthServerClient } from '@repo/auth-api/server.ts';
import type { TestHelpers } from '@repo/auth-api/server.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { AuthDatabase } from '#src/services/database/auth/index.ts';

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
  const auth = yield* AuthServerClient;
  const database = yield* AuthDatabase;
  const context = yield* auth.$context;

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

  yield* Effect.sync(() => {
    database.prepare('update "user" set "role" = ? where "id" = ?').run([user.role, savedUser.id]);
  });

  yield* Effect.addFinalizer(() =>
    Effect.tryPromise(async () => test.deleteUser(savedUser.id)).pipe(Effect.orDie)
  );

  const headers = yield* Effect.tryPromise(async () =>
    test.getAuthHeaders({ userId: savedUser.id })
  ).pipe(Effect.orDie, Effect.map(EffectHeaders.fromInput));

  return RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
    next({ ...request, headers: EffectHeaders.merge(request.headers, headers) })
  );
});
