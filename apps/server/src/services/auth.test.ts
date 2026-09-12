import { BunPath } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpRouter } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AuthClient } from '@repo/auth-api/client.ts';
import { AuthUser } from '@repo/auth-api/shared.ts';

import { AuthLayerNoDeps, AuthRouterLayerNoDeps } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';

const TestServerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      AuthRouterLayerNoDeps.pipe(
        Layer.provide(AuthLayerNoDeps),
        Layer.provide(AuthDatabase.layerNoDeps),
        Layer.provide([ApiConfig.layerTest(), BunPath.layer, Reactivity.layer])
      )
    );
    yield* Effect.addFinalizer(() => Effect.promise(dispose));

    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      return handler(request);
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => vi.unstubAllGlobals()));
  })
);

it.describe('auth customizations', () => {
  it.effect(
    'should not allow sign up when username is missing',
    Effect.fnUntraced(
      function* () {
        const auth = yield* AuthClient.make({ baseURL: 'http://test/', plugins: [] });

        const response = yield* Effect.promise(async () =>
          auth.rawClient.signUp.email({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password',
          })
        );

        expect(response.error).toMatchObject({
          code: 'MUST_SIGN_UP_WITH_USERNAME',
        });
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
    )
  );

  it.effect(
    'should disable unused email endpoints',
    Effect.fnUntraced(
      function* () {
        const disabledPaths = [
          '/change-email',
          '/request-password-reset',
          '/send-verification-email',
          '/sign-in/email',
          '/verify-email',
        ];

        for (const path of disabledPaths) {
          const response = yield* HttpClient.get(`http://test/api/auth${path}`);
          expect(response.status).toBe(404);
        }
      },
      (effect) => effect.pipe(Effect.provide([TestServerLayer, FetchHttpClient.layer]))
    )
  );

  it.effect(
    'should set role as admin for the first user',
    Effect.fnUntraced(
      function* () {
        const auth = yield* AuthClient.make({ baseURL: 'http://test/', plugins: [] });

        const response = yield* auth.signUp.email({
          name: 'Test User',
          username: 'testuser',
          email: 'test@example.com',
          password: 'password',
        });
        expect(response.user.name).toBe('Test User');
        expect(response.user.email).toBe('test@example.com');
        expect(response.user.id).toBeDefined();

        const signInResponse = yield* auth.signIn.username({
          username: 'testuser',
          password: 'password',
        });

        expect(signInResponse.user.name).toBe('Test User');
        expect(signInResponse.user.email).toBe('test@example.com');
        expect(signInResponse.user.id).toBeDefined();
        expect(signInResponse.user.role).toBe('admin');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
    )
  );

  it.effect(
    'should not allow sign up when one user exists',
    Effect.fnUntraced(
      function* () {
        const auth = yield* AuthClient.make({ baseURL: 'http://test/', plugins: [] });

        const response = yield* auth.signUp.email({
          name: 'Test User',
          username: 'testuser',
          email: 'test@example.com',
          password: 'password',
        });
        expect(response.user.name).toBe('Test User');
        expect(response.user.email).toBe('test@example.com');
        expect(response.user.id).toBeDefined();

        const response2 = yield* auth.signUp
          .email({
            name: 'Test User 2',
            username: 'testuser2',
            email: 'test2@example.com',
            password: 'password',
          })
          .pipe(Effect.flip);
        expect(response2.reason).toMatchObject({
          _tag: 'BetterAuthApiError',
          code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
        });
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
    )
  );
});

// Use the actual client and server with a per-client bearer token, like separate devices.
const authenticatedClient = (token: string) =>
  AuthClient.make({
    baseURL: 'http://test/',
    plugins: [
      {
        id: 'test-device',
        fetchPlugins: [
          {
            id: 'test-device',
            name: 'Test device',
            hooks: {
              onRequest: (context) => {
                const headers = new Headers(context.headers);
                headers.set('authorization', `Bearer ${token}`);
                return { ...context, headers };
              },
            },
          },
        ],
      },
    ],
  });

const setupAdmin = Effect.fnUntraced(function* () {
  const guest = yield* AuthClient.make({ baseURL: 'http://test/', plugins: [] });
  const { token, user } = yield* guest.signUp.email({
    name: 'Admin',
    username: 'admin',
    email: 'admin@example.com',
    password: 'password',
  });
  return { guest, admin: yield* authenticatedClient(token), user, token };
});

it.effect(
  'changes a signed-in password only after verifying the current password',
  Effect.fnUntraced(
    function* () {
      const { admin, guest } = yield* setupAdmin();
      const denied = yield* admin
        .changePassword({ currentPassword: 'incorrect', newPassword: 'new-password' })
        .pipe(Effect.flip);
      expect(denied.reason).toMatchObject({ code: 'INVALID_PASSWORD' });
      yield* admin.changePassword({ currentPassword: 'password', newPassword: 'new-password' });
      yield* guest.signIn.username({ username: 'admin', password: 'password' }).pipe(Effect.flip);
      const signedIn = yield* guest.signIn.username({
        username: 'admin',
        password: 'new-password',
      });
      expect(signedIn.user.username).toBe('admin');
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);

it.effect(
  'lists only the signed-in user’s sessions and identifies the current device',
  Effect.fnUntraced(
    function* () {
      const { admin, guest, token } = yield* setupAdmin();
      const second = yield* guest.signIn.username({ username: 'admin', password: 'password' });
      const sessions = yield* admin.listSessions;
      expect(sessions.map((session) => session.token).sort()).toEqual([token, second.token].sort());
      const current = yield* admin.readSession;
      expect(current.session.token).toBe(token);
      yield* guest.listSessions.pipe(Effect.flip);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);

it.effect(
  'revokes another device without signing out the current one, then revokes all',
  Effect.fnUntraced(
    function* () {
      const { admin, guest, token } = yield* setupAdmin();
      const second = yield* guest.signIn.username({ username: 'admin', password: 'password' });
      const device = yield* authenticatedClient(second.token);
      yield* device.readSession;
      yield* admin.revokeSession({ token: second.token });
      yield* admin.revokeSession({ token: second.token });
      yield* device.readSession.pipe(Effect.flip);
      expect((yield* admin.readSession).session.token).toBe(token);
      yield* admin.revokeSessions;
      yield* admin.readSession.pipe(Effect.flip);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);

it.effect(
  'gets full admin user details and rejects unauthenticated access and missing users',
  Effect.fnUntraced(
    function* () {
      const { admin, guest, user } = yield* setupAdmin();
      const details = yield* admin.admin.getUser({ userId: user.id });
      expect(details).toMatchObject({
        id: user.id,
        username: 'admin',
        role: 'admin',
        emailVerified: false,
      });
      yield* guest.admin.getUser({ userId: user.id }).pipe(Effect.flip);
      const missing = yield* admin.admin
        .getUser({ userId: AuthUser.fields.id.make('missing-user') })
        .pipe(Effect.flip);
      expect(missing.reason).toMatchObject({ status: 404 });
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);

const createReader = (admin: Effect.Success<ReturnType<typeof setupAdmin>>['admin']) =>
  admin.admin.createUser({
    name: 'Reader',
    username: 'reader',
    email: 'reader@example.com',
    password: 'reader-password',
    role: AuthUser.fields.role.make('under18'),
  });

it.effect(
  'creates additional users as admin without replacing the admin session',
  Effect.fnUntraced(
    function* () {
      const { admin, guest, token } = yield* setupAdmin();
      const { user } = yield* createReader(admin);
      expect(user).toMatchObject({ username: 'reader', role: 'under18' });
      expect((yield* admin.readSession).session.token).toBe(token);
      const signedIn = yield* guest.signIn.username({
        username: 'reader',
        password: 'reader-password',
      });
      const reader = yield* authenticatedClient(signedIn.token);
      yield* createReader(reader).pipe(Effect.flip);
      yield* createReader(admin).pipe(Effect.flip);
      const page = yield* admin.admin.listUsers({ limit: 10, offset: 0 });
      expect(page.total).toBe(2);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);

it.effect(
  'changes roles with admin authorization and denies ordinary users',
  Effect.fnUntraced(
    function* () {
      const { admin, guest } = yield* setupAdmin();
      const { user } = yield* createReader(admin);
      const login = yield* guest.signIn.username({
        username: 'reader',
        password: 'reader-password',
      });
      const reader = yield* authenticatedClient(login.token);
      yield* reader.admin
        .setRole({ userId: user.id, role: AuthUser.fields.role.make('admin') })
        .pipe(Effect.flip);
      yield* admin.admin.setRole({ userId: user.id, role: AuthUser.fields.role.make('user') });
      expect((yield* admin.admin.getUser({ userId: user.id })).role).toBe('user');
      yield* admin.admin.setRole({ userId: user.id, role: AuthUser.fields.role.make('admin') });
      expect((yield* reader.admin.listUsers({ limit: 10, offset: 0 })).total).toBe(2);
      yield* admin.admin.setRole({ userId: user.id, role: AuthUser.fields.role.make('under18') });
      yield* reader.admin.listUsers({ limit: 10, offset: 0 }).pipe(Effect.flip);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);
