/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it, spyOn } from 'bun:test';

import {
  Array,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  String as Str,
  pipe,
} from 'effect';

import { AuthClient, createAuthClient } from '#src/client.ts';
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

const withResponse = Effect.fnUntraced(function* (response: unknown) {
  const requests: Array<Request> = [];
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? new Request(input, init) : new Request(String(input), init);
        requests.push(request);
        return Response.json(
          pipe(new URL(request.url).pathname, Str.endsWith('/get-session')) ? null : response
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
  const client = yield* AuthClient.make({
    createClient: () => createAuthClient({ baseURL: 'http://auth.test', plugins: [] }),
  });
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
  it('supports plugin actions alongside domain auth commands', async () => {
    await Effect.gen(function* () {
      const client = yield* AuthClient.make({
        createClient: () =>
          createAuthClient({
            baseURL: 'http://auth.test',
            fetchOptions: {
              customFetchImpl: async (input) =>
                Response.json(
                  pipe(
                    input instanceof Request ? input.url : input.toString(),
                    Str.endsWith('/get-session')
                  )
                    ? null
                    : { user }
                ),
            },
            plugins: [
              {
                id: 'test-cookie',
                getActions: () => ({ getCookie: () => 'session=test' }),
              },
            ],
          }),
      });
      expect(client.rawClient.getCookie()).toBe('session=test');
      expect(yield* client.admin.createUser(createUserInput)).toMatchObject({ user: decodedUser });
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('reports factory failures as typed initialization errors', async () => {
    const error = new Error('Client initialization failed');
    await Effect.gen(function* () {
      const failure = yield* AuthClient.make({
        createClient: () => {
          throw error;
        },
      }).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: 'BetterAuthClientInitializationError',
        error: { message: 'Client initialization failed' },
      });
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  for (const { name, path, run } of [
    {
      name: 'user creation',
      path: '/admin/create-user',
      run: (client) => client.admin.createUser(createUserInput),
    },
    {
      name: 'session listing without a request body',
      path: '/list-sessions',
      run: (client) => client.listSessions,
    },
    {
      name: 'the admin profile preflight',
      path: '/admin/get-user',
      run: (client) =>
        client.admin.updateUser({
          userId,
          username: 'renamed',
          name: 'Renamed',
          email: user.email,
        }),
    },
    {
      name: 'the admin profile write',
      path: '/admin/update-user',
      run: (client) =>
        client.admin.updateUser({
          userId,
          username: 'renamed',
          name: 'Renamed',
          email: user.email,
        }),
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly run: (
      client: Pick<AuthClient['Service'], 'admin' | 'listSessions'>
    ) => Effect.Effect<unknown, unknown>;
  }>) {
    it(`forwards interruption to fetch during ${name}`, async () => {
      await Effect.gen(function* () {
        const runPromise = Effect.runPromiseWith(yield* Effect.context());
        const started = yield* Deferred.make<Request>();
        const requests: Array<Request> = [];
        const fetch = spyOn(globalThis, 'fetch').mockImplementation(
          Object.assign(
            async (input: string | URL | Request, init?: RequestInit) => {
              const request =
                input instanceof Request
                  ? new Request(input, init)
                  : new Request(String(input), init);
              requests.push(request);
              if (new URL(request.url).pathname !== `/api/auth${path}`) {
                return Response.json(
                  new URL(request.url).pathname === '/api/auth/admin/get-user' ? user : null
                );
              }
              const pending = runPromise(Effect.never, { signal: request.signal });
              Deferred.doneUnsafe(started, Effect.succeed(request));
              return pending;
            },
            { preconnect: globalThis.fetch.preconnect }
          )
        );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            fetch.mockRestore();
          })
        );
        const client = yield* AuthClient.make({
          createClient: () => createAuthClient({ baseURL: 'http://auth.test', plugins: [] }),
        });
        const fiber = yield* run(client).pipe(Effect.forkChild);
        const request = yield* Deferred.await(started);
        expect(request.signal.aborted).toBe(false);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        expect(request.signal.aborted).toBe(true);
        expect(Exit.hasInterrupts(exit)).toBe(true);
        expect(Exit.findErrorOption(exit)).toEqual(Option.none());
        if (path === '/admin/get-user') {
          expect(
            Array.some(
              requests,
              (item) => new URL(item.url).pathname === '/api/auth/admin/update-user'
            )
          ).toBe(false);
        }
      }).pipe(Effect.scoped, Effect.runPromise);
    });
  }

  it('decodes admin users and pagination, including Better Auth dates', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({ users: [user], total: 1, limit: 10 });
      const page = yield* client.admin.listUsers({ limit: 10, offset: 0 });
      expect(page).toMatchObject({ users: [decodedUser], total: 1, limit: 10 });
      const request = Option.getOrThrow(
        Array.findFirst(requests, (item) => pipe(item.url, Str.includes('/admin/list-users')))
      );
      expect(new URL(request.url).searchParams.get('offset')).toBe('0');
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
      const createRequest = Option.getOrThrow(
        Array.findFirst(requests, (request) =>
          pipe(request.url, Str.endsWith('/admin/create-user'))
        )
      );
      const roleRequest = Option.getOrThrow(
        Array.findFirst(requests, (request) => pipe(request.url, Str.endsWith('/admin/set-role')))
      );
      expect(yield* Effect.promise(async () => createRequest.json())).toEqual({
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password',
        role: 'user',
        data: { username: 'reader' },
      });
      expect(yield* Effect.promise(async () => roleRequest.json())).toEqual({
        userId,
        role: 'under18',
      });
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('rejects role changes through profile updates before sending them', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({});
      const input = { name: 'Reader', role: 'admin' };
      const updateError = yield* client.updateUser(input).pipe(Effect.flip);
      expect(updateError.reason._tag).toBe('InvalidAuthInputError');
      expect(
        Array.filter(requests, (request) => !pipe(request.url, Str.endsWith('/get-session')))
      ).toEqual([]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });
});
