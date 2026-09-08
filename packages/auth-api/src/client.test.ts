/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it, spyOn } from 'bun:test';

import { DateTime, Effect, Schema } from 'effect';

import { AuthClient } from '#src/client.ts';
import type { AuthError } from '#src/shared.ts';
import { AuthSession, AuthUser, AuthUserResponse } from '#src/shared.ts';

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

type AuthActions = Omit<AuthClient['Service'], 'rawClient'>;

const operations = [
  {
    name: 'createUser',
    run: (client: AuthActions) => client.admin.createUser(createUserInput),
  },
  {
    name: 'setRole',
    run: (client: AuthActions) =>
      client.admin.setRole({ userId, role: AuthUser.fields.role.make('under18') }),
  },
  {
    name: 'listUsers',
    run: (client: AuthActions) => client.admin.listUsers({ limit: 10, offset: 0 }),
  },
  {
    name: 'signIn',
    run: (client: AuthActions) =>
      client.signIn.username({ username: 'reader', password: 'password' }),
  },
  {
    name: 'signUp',
    run: (client: AuthActions) =>
      client.signUp.email({
        username: 'reader',
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password',
      }),
  },
];

describe('auth response boundary', () => {
  for (const { name, run } of operations) {
    it(`${name} rejects malformed success data as an AuthError`, async () => {
      await Effect.gen(function* () {
        const { client } = yield* withResponse({ unrelated: true });
        const result: Effect.Effect<unknown, AuthError> = run(client);
        const error = yield* result.pipe(Effect.asVoid, Effect.flip);
        expect(error).toMatchObject({
          _tag: 'AuthError',
          reason: { _tag: 'InvalidAuthResponseError' },
        });
      }).pipe(Effect.scoped, Effect.runPromise);
    });
  }

  it('decodes admin users and pagination, including Better Auth dates', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({ users: [user], total: 1, limit: 10 });
      const page = yield* client.admin.listUsers({ limit: 10, offset: 0 });
      expect(page.users[0]).toBeInstanceOf(AuthUser);
      expect(page.users[0]?.createdAt).toEqual(
        AuthUser.fields.createdAt.make(DateTime.makeUnsafe(user.createdAt))
      );
      expect(page.total).toBe(1);
      const request = requests.find((item) => item.url.includes('/admin/list-users'));
      expect(request && new URL(request.url).searchParams.get('offset')).toBe('0');
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  for (const response of [
    { users: [user], total: -1 },
    { users: [user], total: '1' },
    { users: [user], total: 1, limit: 0 },
    { users: [user], total: 1, offset: -1 },
    { users: [{ ...user, role: 'unknown' }], total: 1 },
  ]) {
    it(`rejects invalid user pages: ${JSON.stringify(response)}`, async () => {
      await Effect.gen(function* () {
        const { client } = yield* withResponse(response);
        const error = yield* client.admin.listUsers({ limit: 10, offset: 0 }).pipe(Effect.flip);
        expect(error.reason._tag).toBe('InvalidAuthResponseError');
      }).pipe(Effect.scoped, Effect.runPromise);
    });
  }

  it('adapts user creation and role updates without exposing vendor field bags', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({ user });
      expect((yield* client.admin.createUser(createUserInput)).user).toBeInstanceOf(AuthUser);
      expect(
        (yield* client.admin.setRole({ userId, role: AuthUser.fields.role.make('under18') })).user
      ).toBeInstanceOf(AuthUser);
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

  it('discards results for actions returning void', async () => {
    await Effect.gen(function* () {
      const { client } = yield* withResponse({ status: true, success: true });
      expect(yield* client.updateUser({ name: 'Reader' })).toBe(void 0);
      expect(yield* client.signOut).toBe(void 0);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('rejects invalid commands before sending them', async () => {
    await Effect.gen(function* () {
      const { client, requests } = yield* withResponse({});
      const error = yield* client.admin.listUsers({ limit: 0, offset: -1 }).pipe(Effect.flip);
      expect(error.reason._tag).toBe('InvalidAuthInputError');
      // Structural typing must not let unknown fields escape through the adapter.
      const input = { name: 'Reader', role: 'admin' };
      const updateError = yield* client.updateUser(input).pipe(Effect.flip);
      expect(updateError.reason._tag).toBe('InvalidAuthInputError');
      expect(requests.filter((request) => !request.url.endsWith('/get-session'))).toEqual([]);
    }).pipe(Effect.scoped, Effect.runPromise);
  });

  it('uses the same identity and credential types in sign-in and session responses', () => {
    const sessionUser = {
      ...user,
      createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(user.createdAt)),
      updatedAt: DateTime.toDateUtc(DateTime.makeUnsafe(user.updatedAt)),
    };
    const response = Schema.decodeSync(AuthUserResponse)({
      token: 'session-token',
      user: sessionUser,
    });
    const session = Schema.decodeSync(AuthSession)({
      user: sessionUser,
      session: {
        id: 'session-1',
        userId: user.id,
        token: 'session-token',
        ipAddress: null,
        userAgent: null,
        createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(user.createdAt)),
        updatedAt: DateTime.toDateUtc(DateTime.makeUnsafe(user.updatedAt)),
        expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe('2027-01-01')),
      },
    });
    const id: AuthUser['id'] = session.session.userId;
    const token: AuthSession['session']['token'] = response.token;
    expect(id).toBe(response.user.id);
    expect(token).toBe(session.session.token);
  });
});
