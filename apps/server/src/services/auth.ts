import { Effect, Layer, Match, Option, Redacted } from 'effect';
import { HttpEffect, HttpRouter } from 'effect/unstable/http';

import { AuthServerClient } from '@repo/auth-api/server.ts';
import {
  AdminMiddleware,
  AuthMiddleware,
  CurrentSession,
  ForbiddenError,
  UnauthorizedError,
} from '@repo/spec-api/middlewares/auth.ts';

import { ApiConfig } from '#src/services/config.ts';
import { Database } from '#src/services/database/index.ts';

export const AuthLayerNoDeps = Layer.effect(
  AuthServerClient,
  Effect.gen(function* () {
    const config = yield* ApiConfig;
    const sql = yield* Database;

    const runtime = Effect.runSyncWith(yield* Effect.context());

    return yield* AuthServerClient.make({
      secret: Redacted.value(config.auth.secret),
      database: sql.kysely,
      logger: {
        log: (level, message, ...args) => {
          Match.value(level).pipe(
            Match.when('debug', () => {
              runtime(Effect.logDebug(message, args));
              return void 0;
            }),
            Match.when('info', () => {
              runtime(Effect.logInfo(message, args));
              return void 0;
            }),
            Match.when('warn', () => {
              runtime(Effect.logWarning(message, args));
              return void 0;
            }),
            Match.when('error', () => {
              runtime(Effect.logError(message, args));
              return void 0;
            }),
            Match.exhaustive
          );
        },
      },
    });
  })
);

export const AuthLayer = AuthLayerNoDeps.pipe(
  Layer.provide(Layer.mergeAll(ApiConfig.layer, Database.layer))
);

export const AuthRouterLayerNoDeps = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const auth = yield* AuthServerClient;

    yield* router
      .prefixed('/api/auth')
      .add('*', '*', Effect.orDie(HttpEffect.fromWebHandler(auth.handler)));
  })
);

export const AuthRouterLayer = AuthRouterLayerNoDeps.pipe(Layer.provide(AuthLayer));

export const AuthMiddlewareLayerNoDeps = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const auth = yield* AuthServerClient;

    return AuthMiddleware.of(
      Effect.fnUntraced(function* (httpEffect, { headers }) {
        const session = yield* auth.api.getSession({ headers }).pipe(
          Effect.catchReasons(
            'AuthError',
            {
              BetterAuthApiError: Effect.die,
              AuthTransportError: Effect.die,
              InvalidAuthResponseError: Effect.die,
            },
            Effect.die
          )
        );

        if (Option.isNone(session)) {
          return yield* UnauthorizedError.make({});
        }

        return yield* Effect.provideService(httpEffect, CurrentSession, session.value);
      })
    );
  })
);

export const AuthMiddlewareLayer = AuthMiddlewareLayerNoDeps.pipe(Layer.provide(AuthLayer));

export const AdminMiddlewareLayerNoDeps = Layer.succeed(
  AdminMiddleware,
  AdminMiddleware.of(
    Effect.fnUntraced(function* (effect) {
      const session = yield* CurrentSession;

      if (session.user.role !== 'admin') {
        return yield* ForbiddenError.make({});
      }

      return yield* effect;
    })
  )
);

export const AdminMiddlewareLayer = AdminMiddlewareLayerNoDeps;
