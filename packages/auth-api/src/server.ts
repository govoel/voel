import { expo } from '@better-auth/expo';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { createAdapterFactory } from 'better-auth/adapters';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { admin, username } from 'better-auth/plugins';
import type { Context } from 'effect';
import { Duration, Effect } from 'effect';

export const createAuth = <
  R extends SqliteClient.SqliteClient = SqliteClient.SqliteClient,
>(config: {
  secret: string;
  effect: { context: Context.Context<R> };
}) => {
  const runtime = Effect.runPromiseWith(config.effect.context);

  return betterAuth({
    appName: 'Voel',
    basePath: '/api/auth',
    secret: config.secret,
    experimental: { joins: true },
    advanced: { cookiePrefix: 'auth' },
    emailAndPassword: { enabled: false, autoSignIn: true, disableSignUp: true },
    telemetry: { enabled: false },
    trustedOrigins: ['voel://'],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: Duration.fromInputUnsafe('5 minutes').pipe(Duration.toSeconds),
      },
    },
    database: () =>
      createAdapterFactory({
        config: {
          adapterId: 'effect',
          adapterName: 'Effect',
          usePlural: false,
          debugLogs: false,
          supportsNumericIds: true,
          supportsUUIDs: false,
          supportsJSON: false,
          supportsDates: false,
          supportsBooleans: false,
          supportsArrays: false,
        },
        adapter: () => ({
          create: async <T extends Record<string, any>>({ data, model, select }) => {
            const result = await runtime(
              Effect.service(SqliteClient.SqliteClient).pipe(
                Effect.flatMap((sql) =>
                  Array.isArray(select) && select.length > 0
                    ? sql<T>`INSERT INTO ${sql(model)} ${sql.insert(data)} RETURNING ${sql.csv(select)}`
                    : sql<T>`INSERT INTO ${sql(model)} ${sql.insert(data)}`
                )
              )
            );
          },
        }),
      }),
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
};

export type BetterAuthInstance = ReturnType<typeof createAuth>;

export type Session = BetterAuthInstance['$Infer']['Session'];
