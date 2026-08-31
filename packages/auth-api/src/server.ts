import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { testUtils } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins/admin';
import { bearer } from 'better-auth/plugins/bearer';
import { username } from 'better-auth/plugins/username';
import { Context, Duration, Effect, Option, Schema } from 'effect';

import {
  AuthError,
  AuthSession,
  AuthTransportError,
  InvalidAuthResponseError,
} from '#src/shared.ts';

export type { TestHelpers } from 'better-auth/plugins';

const createServerAuthClient = (config: {
  secret: NonNullable<BetterAuthOptions['secret']>;
  database: {
    readonly close: () => void;
    readonly prepare: (sql: unknown) => {
      readonly reader: boolean;
      readonly all: (parameters: ReadonlyArray<unknown>) => Array<unknown>;
      readonly run: (parameters: ReadonlyArray<unknown>) => {
        readonly changes: number | bigint;
        readonly lastInsertRowid: number | bigint;
      };
      readonly iterate: (parameters: ReadonlyArray<unknown>) => IterableIterator<unknown>;
    };
    readonly aggregate: (name: unknown, options: unknown) => void;
  };
  logger: BetterAuthOptions['logger'];
}) =>
  betterAuth({
    appName: 'Voel',
    basePath: '/api/auth',
    disabledPaths: [
      '/change-email',
      '/request-password-reset',
      '/send-verification-email',
      '/sign-in/email',
      '/verify-email',
    ],
    secret: config.secret,
    advanced: { cookiePrefix: 'auth', database: { joins: true } },
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
    database: config.database,
    plugins: [
      expo(),
      bearer(),
      username({ displayUsername: false }),
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
        }
      }),
    },
  });

export type BetterAuthInstance = ReturnType<typeof createServerAuthClient>;

class BetterAuthServerClientInitializationError extends Schema.TaggedError<
  BetterAuthServerClientInitializationError,
  { readonly brand: unique symbol }
>('@repo/auth-api/server/BetterAuthServerClientInitializationError')(
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
              Effect.catchTags({
                AuthTransportError: (reason) => AuthError.make({ reason }),
                InvalidAuthResponseError: (reason) => AuthError.make({ reason }),
              })
            ),
        },
      };
    }),
  }
) {}
