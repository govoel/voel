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

const createReader = (admin: Effect.Success<ReturnType<typeof setupAdmin>>['admin']) =>
  admin.admin.createUser({
    name: 'Reader',
    username: 'reader',
    email: 'reader@example.com',
    password: 'reader-password',
    role: AuthUser.fields.role.make('under18'),
  });

it.effect(
  'edits another user’s profile without allowing role fields through the profile adapter',
  Effect.fnUntraced(
    function* () {
      const { admin, guest } = yield* setupAdmin();
      const { user } = yield* createReader(admin);
      const input = {
        userId: user.id,
        name: 'Updated Reader',
        username: 'updatedreader',
        email: 'updated@example.com',
        image: null,
      };
      const updated = yield* admin.admin.updateUser(input);
      expect(updated).toMatchObject({
        name: input.name,
        username: input.username,
        email: input.email,
        image: null,
        role: 'under18',
      });
      const repeated = yield* admin.admin.updateUser(input);
      expect(repeated.username).toBe(input.username);
      const renamed = yield* admin.admin.updateUser({ ...input, name: 'Name only' });
      expect(renamed).toMatchObject({ name: 'Name only', username: input.username });
      const extraFields = { ...input, role: 'admin' };
      const invalid = yield* admin.admin.updateUser(extraFields).pipe(Effect.flip);
      expect(invalid.reason._tag).toBe('InvalidAuthInputError');
      const signedIn = yield* guest.signIn.username({
        username: input.username,
        password: 'reader-password',
      });
      const reader = yield* authenticatedClient(signedIn.token);
      yield* reader.admin.updateUser(input).pipe(Effect.flip);
    },
    (effect) => effect.pipe(Effect.provide(TestServerLayer))
  )
);
