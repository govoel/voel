import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { testUtils } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins/admin';
import { username } from 'better-auth/plugins/username';
import { Context, Duration, Effect, Option, Schema } from 'effect';

import type { Kysely } from '@repo/effect-kysely';

import {
  AuthError,
  AuthSession,
  AuthTransportError,
  InvalidAuthResponseError,
} from '#src/shared.ts';

export type { TestHelpers } from 'better-auth/plugins';

const createServerAuthClient = (config: {
  secret: NonNullable<BetterAuthOptions['secret']>;
  // oxlint-disable-next-line typescript/no-explicit-any
  database: Kysely<any>;
  logger: BetterAuthOptions['logger'];
}) =>
  betterAuth({
    appName: 'Voel',
    basePath: '/api/auth',
    secret: config.secret,
    experimental: { joins: true },
    advanced: { cookiePrefix: 'auth' },
    emailAndPassword: { enabled: true, autoSignIn: true, disableSignUp: true },
    telemetry: { enabled: false },
    trustedOrigins: ['voel://', 'voel-preview://', 'voel-dev://'],
    logger: config.logger,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
      },
    },
    database: { db: config.database, type: 'sqlite' },
    plugins: [
      expo(),
      username(),
      admin({ defaultRole: 'under18' as const, adminRoles: ['admin' as const] }),
      {
        id: 'voel-init',
        init: (ctx) => ({
          options: {
            databaseHooks: {
              user: {
                create: {
                  before: async (user) => {
                    const userCount = await ctx.internalAdapter.countTotalUsers();
                    if (userCount === 0) {
                      return { data: { ...user, role: 'admin' } };
                    }
                    return { data: user };
                  },
                },
              },
            },
          },
        }),
      },
      // @ts-expect-error - better-auth plugins don't really support exactOptionalPropertyTypes
      testUtils(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email') {
          if (!('username' in ctx.body)) {
            throw new APIError('BAD_REQUEST', {
              code: 'MUST_SIGN_UP_WITH_USERNAME',
              message: 'Email sign-up is disabled. Please sign up with a username.',
            });
          } else {
            const userCount = await ctx.context.internalAdapter.countTotalUsers();
            const disableSignUp = userCount > 0;

            if (typeof ctx.context.options.emailAndPassword === 'object') {
              ctx.context.options.emailAndPassword.disableSignUp = disableSignUp;
            } else {
              ctx.context.options.emailAndPassword = {
                enabled: false,
                autoSignIn: true,
                disableSignUp,
              };
            }
          }
        } else if (ctx.path === '/sign-in/email') {
          throw new APIError('BAD_REQUEST', {
            code: 'MUST_SIGN_IN_WITH_USERNAME',
            message: 'Email sign-in is disabled. Please sign in with your username.',
          });
        }
      }),
    },
  });

export type BetterAuthInstance = ReturnType<typeof createServerAuthClient>;

class BetterAuthServerClientInitializationError extends Schema.TaggedError<
  BetterAuthServerClientInitializationError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthServerClientInitializationError')(
  'BetterAuthServerClientInitializationError',
  { error: Schema.Unknown }
) {}

export class AuthServerClient extends Context.Service<AuthServerClient>()(
  '@repo/auth-api/server/AuthServerClient',
  {
    make: Effect.fnUntraced(function* (config: Parameters<typeof createServerAuthClient>[0]) {
      const client = yield* Effect.try({
        try: () => createServerAuthClient(config),
        catch: (error) => BetterAuthServerClientInitializationError.make({ error }),
      });

      return {
        $context: Effect.tryPromise(async () => client.$context).pipe(Effect.orDie),
        handler: client.handler,

        api: {
          getSession: (input: Parameters<typeof client.api.getSession>[0]) =>
            Effect.tryPromise({
              try: async () => client.api.getSession(input),
              catch: (cause) => AuthTransportError.make({ cause }),
            }).pipe(
              Effect.map(Option.fromNullishOr),
              Effect.map(Option.map(AuthSession.decodeUnknownEffect)),
              Effect.flatMap(Effect.transposeOption),
              Effect.catchTag('SchemaError', () => Effect.fail(InvalidAuthResponseError.make())),
              Effect.mapError((reason) => AuthError.make({ reason }))
            ),
        },
      };
    }),
  }
) {}
