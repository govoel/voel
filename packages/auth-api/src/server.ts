import type Database from 'bun:sqlite';

import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { testUtils } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins/admin';
import { username } from 'better-auth/plugins/username';
import { Duration } from 'effect';

export type { TestHelpers } from 'better-auth/plugins';

export const createAuth = (config: {
  secret: NonNullable<BetterAuthOptions['secret']>;
  database: Database;
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
    trustedOrigins: ['voel://'],
    logger: config.logger,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
      },
    },
    database: config.database,
    plugins: [
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

export type BetterAuthInstance = ReturnType<typeof createAuth>;

export type Session = BetterAuthInstance['$Infer']['Session'];
