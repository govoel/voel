import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Context, Effect, Layer, Match, Redacted } from 'effect';
import { HttpEffect, HttpRouter } from 'effect/unstable/http';

import { createAuth } from '@repo/auth-api/server.ts';
import {
  AdminMiddleware,
  AuthMiddleware,
  CurrentSession,
  Unauthorized,
} from '@repo/spec-api/middlewares/auth.ts';

import { ApiConfig } from '#src/services/config.ts';

export class Auth extends Context.Service<Auth>()('@repo/server/services/auth', {
  make: Effect.gen(function* () {
    const config = yield* ApiConfig;
    const sql = yield* SqliteClient.SqliteClient;

    const runtime = Effect.runSyncWith(yield* Effect.context());

    return createAuth({
      secret: Redacted.value(config.auth.secret),
      database: sql.database,
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
  }),
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

    return AuthMiddleware.of(
      Effect.fnUntraced(function* (httpEffect, { headers }) {
        const session = yield* Effect.tryPromise({
          try: async () => auth.api.getSession({ headers }),
          catch: () => new Unauthorized({}),
        });

        if (session === null) {
          return yield* new Unauthorized({});
        }

        return yield* Effect.provideService(httpEffect, CurrentSession, session);
      })
    );
  })
);

export const AdminMiddlewareLive = Layer.succeed(
  AdminMiddleware,
  AdminMiddleware.of(
    Effect.fnUntraced(function* (effect) {
      const session = yield* CurrentSession;

      if (!('role' in session.user) || session.user.role !== 'admin') {
        return yield* new Unauthorized({});
      }

      return yield* effect;
    })
  )
);
