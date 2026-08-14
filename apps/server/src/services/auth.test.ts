import { BunPath } from '@effect/platform-bun';
/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { AuthClient } from '@repo/auth-api/client.ts';

import { AuthLayerNoDeps, AuthRouterLayerNoDeps } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

const TestServerLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      AuthRouterLayerNoDeps.pipe(
        Layer.provide(AuthLayerNoDeps),
        Layer.provide(Database.layerNoDeps),
        Layer.provide([ApiConfig.layerTest(), BunPath.layer])
      )
    );
    yield* Effect.addFinalizer(() => Effect.tryPromise(async () => dispose()));

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

        const response = yield* auth.signUp
          .email({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password',
          })
          .pipe(Effect.flip);

        expect(response.code).toBe('MUST_SIGN_UP_WITH_USERNAME');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
    )
  );

  it.effect(
    'should not allow sign in with email',
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

        const signInResponse = yield* auth.signIn
          .email({
            email: 'test@example.com',
            password: 'password',
          })
          .pipe(Effect.flip);

        expect(signInResponse.code).toBe('MUST_SIGN_IN_WITH_USERNAME');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
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
        expect(response2.code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLayer))
    )
  );
});
