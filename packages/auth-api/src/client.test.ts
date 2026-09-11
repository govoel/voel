/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it, spyOn } from 'bun:test';

import { DateTime, Deferred, Effect, Fiber } from 'effect';

import { AuthClient } from '#src/client.ts';
import { AuthUser } from '#src/shared.ts';

const user = {
  id: 'user-1',
  username: 'reader',
  name: 'Reader',
  email: 'reader@example.com',
  role: 'user' as const,
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Exercise the actual Better Auth client, including its response/date parsing.
const withResponse = Effect.fnUntraced(function* (response: unknown) {
  const requests: Array<Request> = [];
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? new Request(input, init) : new Request(String(input), init);
        requests.push(request);
        return Response.json(
          new URL(request.url).pathname.endsWith('/get-session') ? null : response
        );
      },
      { preconnect: globalThis.fetch.preconnect }
    )
  );
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      fetch.mockRestore();
    })
  );
  const client = yield* AuthClient.make({ baseURL: 'http://auth.test', plugins: [] });
  return { client, requests };
});

const createUserInput = {
  username: 'reader',
  name: 'Reader',
  email: 'reader@example.com',
  password: 'password',
  role: AuthUser.fields.role.make('user'),
};

const userId = AuthUser.fields.id.make('user-1');
const decodedUser = {
  ...user,
  createdAt: DateTime.makeUnsafe(user.createdAt),
  updatedAt: DateTime.makeUnsafe(user.updatedAt),
};

describe('auth client integration', () => {
  it('aborts the underlying page request when its Effect fiber is interrupted', async () => {
    await Effect.gen(function* () {
      const started = yield* Deferred.make<Request>();
      const runSync = Effect.runSyncWith(yield* Effect.context());
      const fetch = spyOn(globalThis, 'fetch').mockImplementation(
        Object.assign(
          async (input: string | URL | Request, init?: RequestInit) => {
            const request =
              input instanceof Request
                ? new Request(input, init)
                : new Request(String(input), init);
            if (!request.url.includes('/admin/list-users')) {
              return Response.json(null);
            }
            const response = Promise.withResolvers<Response>();
            request.signal.addEventListener(
              'abort',
              () => {
                response.reject(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
            runSync(Deferred.succeed(started, request));
            return response.promise;
          },
          { preconnect: globalThis.fetch.preconnect }
        )
      );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fetch.mockRestore();
        })
      );
      const client = yield* AuthClient.make({ baseURL: 'http://auth.test', plugins: [] });
      const fiber = yield* client.admin.listUsers({ offset: 0, limit: 50 }).pipe(Effect.forkScoped);
      const request = yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(request.signal.aborted).toBe(true);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('decodes admin users and pagination, including Better Auth dates', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({ users: [user], total: 1, limit: 10 });
      const page = yield* client.admin.listUsers({ limit: 10, offset: 0 });
      expect(page).toMatchObject({ users: [decodedUser], total: 1, limit: 10 });
      const request = requests.find((item) => item.url.includes('/admin/list-users'));
      expect(request && new URL(request.url).searchParams.get('offset')).toBe('0');
      expect(request && new URL(request.url).searchParams.get('sortBy')).toBe('id');
      expect(request && new URL(request.url).searchParams.get('sortDirection')).toBe('asc');
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('rejects server users with roles outside the domain contract', async () => {
    await Effect.gen(function* () {
      const { client } = yield* withResponse({
        users: [{ ...user, role: 'unknown' }],
        total: 1,
      });
      const error = yield* client.admin.listUsers({ limit: 10, offset: 0 }).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'AuthError',
        reason: { _tag: 'InvalidAuthResponseError' },
      });
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('adapts user creation and role updates without exposing vendor field bags', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({ user });
      yield* client.admin.createUser(createUserInput);
      yield* client.admin.setRole({ userId, role: AuthUser.fields.role.make('under18') });
      const createRequest = requests.find((request) => request.url.endsWith('/admin/create-user'));
      const roleRequest = requests.find((request) => request.url.endsWith('/admin/set-role'));
      expect(yield* Effect.promise(async () => createRequest?.json())).toEqual({
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password',
        role: 'user',
        data: { username: 'reader' },
      });
      expect(yield* Effect.promise(async () => roleRequest?.json())).toEqual({
        userId,
        role: 'under18',
      });
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('rejects role changes through profile updates before sending them', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({});
      // Structural typing must not let unknown fields escape through the adapter.
      const input = { name: 'Reader', role: 'admin' };
      const updateError = yield* client.updateUser(input).pipe(Effect.flip);
      expect(updateError.reason._tag).toBe('InvalidAuthInputError');
      expect(requests.filter((request) => !request.url.endsWith('/get-session'))).toEqual([]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });
});
