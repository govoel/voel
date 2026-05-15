import { expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';

import { createAuthClient } from '@repo/auth-api/client.ts';

import { AllRoutes } from '#src/index.ts';
import { ApiConfig } from '#src/services/config.ts';

const TestServerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      AllRoutes.pipe(Layer.provide(Layer.mergeAll(HttpServer.layerServices, ApiConfig.layerTest())))
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
        const auth = createAuthClient({ baseURL: 'http://test/' });

        const response = yield* Effect.tryPromise(async () =>
          auth.signUp.email({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password',
          })
        );

        expect(response.data).toBe(null);
        expect(response.error?.code).toBe('MUST_SIGN_UP_WITH_USERNAME');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLive))
    )
  );

  it.effect(
    'should not allow sign in with email',
    Effect.fnUntraced(
      function* () {
        const auth = createAuthClient({ baseURL: 'http://test/' });

        const response = yield* Effect.tryPromise(async () =>
          auth.signUp.email({
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password',
          })
        );
        expect(response.error).toBe(null);
        expect(response.data?.user.name).toBe('Test User');
        expect(response.data?.user.email).toBe('test@example.com');
        expect(response.data?.user.id).toBeDefined();

        const signInResponse = yield* Effect.tryPromise(async () =>
          auth.signIn.email({
            email: 'test@example.com',
            password: 'password',
          })
        );

        expect(signInResponse.data).toBe(null);
        expect(signInResponse.error?.code).toBe('MUST_SIGN_IN_WITH_USERNAME');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLive))
    )
  );

  it.effect(
    'should set role as admin for the first user',
    Effect.fnUntraced(
      function* () {
        const auth = createAuthClient({ baseURL: 'http://test/' });

        const response = yield* Effect.tryPromise(async () =>
          auth.signUp.email({
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password',
          })
        );
        expect(response.error).toBe(null);
        expect(response.data?.user.name).toBe('Test User');
        expect(response.data?.user.email).toBe('test@example.com');
        expect(response.data?.user.id).toBeDefined();

        const signInResponse = yield* Effect.tryPromise(async () =>
          auth.signIn.username({
            username: 'testuser',
            password: 'password',
          })
        );

        expect(signInResponse.data?.user.name).toBe('Test User');
        expect(signInResponse.data?.user.email).toBe('test@example.com');
        expect(signInResponse.data?.user.id).toBeDefined();
        expect(signInResponse.data?.user.role).toBe('admin');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLive))
    )
  );

  it.effect(
    'should not allow sign up when one user exists',
    Effect.fnUntraced(
      function* () {
        const auth = createAuthClient({ baseURL: 'http://test/' });

        const response = yield* Effect.tryPromise(async () =>
          auth.signUp.email({
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password',
          })
        );
        expect(response.error).toBe(null);
        expect(response.data?.user.name).toBe('Test User');
        expect(response.data?.user.email).toBe('test@example.com');
        expect(response.data?.user.id).toBeDefined();

        const response2 = yield* Effect.tryPromise(async () =>
          auth.signUp.email({
            name: 'Test User 2',
            username: 'testuser2',
            email: 'test2@example.com',
            password: 'password',
          })
        );
        expect(response2.data).toBe(null);
        expect(response2.error?.code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');
      },
      (effect) => effect.pipe(Effect.provide(TestServerLive))
    )
  );
});
