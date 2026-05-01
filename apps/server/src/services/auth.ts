import { Context, Effect, Layer, Redacted } from 'effect';
import { HttpEffect, HttpRouter, HttpServerRequest } from 'effect/unstable/http';
import { HttpApiError } from 'effect/unstable/httpapi';

import { createAuth } from '@repo/auth-api/server.ts';
import { AuthMiddleware, CurrentSession } from '@repo/spec-api';

import { ApiConfig } from '#src/services/config.ts';

export class Auth extends Context.Service<Auth>()('@repo/server/services/auth', {
  make: Effect.service(ApiConfig).pipe(
    Effect.map((config) => createAuth({ secret: Redacted.value(config.auth.secret) }))
  ),
}) {
  public static readonly layer = Layer.effect(this, this.make);
}

export const AuthRouterLive = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const auth = yield* Auth;

    yield* router
      .prefixed('/api/auth')
      .add('*', '*', Effect.orDie(HttpEffect.fromWebHandler(auth.handler)));
  })
);

export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* Auth;

    return AuthMiddleware.of({
      cookie: Effect.fnUntraced(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;

        const session = yield* Effect.tryPromise({
          try: async () => auth.api.getSession({ headers: request.headers }),
          catch: () => new HttpApiError.Unauthorized({}),
        });

        if (session === null) {
          return yield* new HttpApiError.Unauthorized({});
        }

        return yield* Effect.provideService(httpEffect, CurrentSession, session);
      }),
    });
  })
);
