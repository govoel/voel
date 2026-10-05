import { Effect } from 'effect';
import { Headers as EffectHeaders } from 'effect/http';
import { HttpApiMiddleware } from 'effect/http-api';

import { AuthServerClient } from '@repo/auth-api/server.ts';
import type { TestHelpers } from '@repo/auth-api/server.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { AuthDatabase } from '#src/services/database/auth/index.ts';

// Raw requests bypass generated-client validation while retaining both cancellation signals.
export const makeRawRequest = ({
  handler,
  headers,
}: {
  readonly handler: (request: Request) => Promise<Response>;
  readonly headers: EffectHeaders.Headers;
}) =>
  Effect.fnUntraced(function* ({ path, ...init }: { readonly path: string } & RequestInit) {
    const requestHeaders = new globalThis.Headers(headers);
    new globalThis.Headers(init.headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
    if (init.body !== void 0 && !requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json');
    }
    return yield* Effect.promise(async (signal) => {
      const requestSignal = init.signal ? AbortSignal.any([signal, init.signal]) : signal;
      // toWebHandler listens for future aborts but does not reject already-aborted signals.
      requestSignal.throwIfAborted();
      return handler(
        new Request(`http://localhost${path}`, {
          ...init,
          headers: requestHeaders,
          signal: requestSignal,
        })
      );
    });
  });

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

  return {
    headers,
    layer: HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
      next({ ...request, headers: EffectHeaders.merge(request.headers, headers) })
    ),
  };
});
