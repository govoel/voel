import { expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';

import { createAuthClient } from '@repo/auth-api/client.ts';

import { AllRoutes } from '#src/index.ts';
import { ApiConfig } from '#src/services/config.ts';

const TestServerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const { handler, dispose } = HttpRouter.toWebHandler(
      AllRoutes.pipe(
        Layer.provide(
          Layer.mergeAll(
            HttpServer.layerServices,
            ApiConfig.layerTest({ AUTH_SECRET: 'test', DB_FILENAME: ':memory:' })
          )
        )
      )
    );
    yield* Effect.addFinalizer(() => Effect.tryPromise(async () => dispose()));

    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      return handler(request);
    });
  })
);

it.describe('auth customizations', () => {
  it.layer(TestServerLive)(({ effect }) => {
    effect(
      'should not allow sign up when username is missing',
      Effect.fnUntraced(function* () {
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
      })
    );
  });

  it.layer(TestServerLive)(({ effect }) => {
    effect(
      'should not allow sign in with email',
      Effect.fnUntraced(function* () {
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
      })
    );
  });
});
