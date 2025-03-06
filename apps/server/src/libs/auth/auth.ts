import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { admin, createAuthMiddleware, username } from 'better-auth/plugins';

import { dialect } from '../db';

export const auth = betterAuth({
  database: {
    dialect,
    type: 'sqlite',
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    disableSignUp: true,
  },
  trustedOrigins: ['apricotta://'],
  plugins: [
    expo(),
    username(),
    admin({ defaultRole: 'under18', adminRoles: ['admin'] }),
    {
      id: 'apricotta-init',
      init(ctx) {
        return {
          options: {
            databaseHooks: {
              user: {
                create: {
                  before: async (user) => {
                    const userCount = await ctx.internalAdapter.countTotalUsers();

                    if (userCount === 0) {
                      return {
                        data: {
                          ...user,
                          role: 'admin',
                        },
                      };
                    }
                  },
                },
              },
            },
          },
        };
      },
    },
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/sign-up/email') {
        if (!('username' in ctx.body)) {
          throw new APIError('BAD_REQUEST', {
            code: 'MUST_SIGN_UP_WITH_USERNAME',
            message: 'You must sign up with your username.',
          });
        } else {
          const userCount = await ctx.context.internalAdapter.countTotalUsers();
          if (userCount === 0) {
            ctx.context.options.emailAndPassword!.disableSignUp = false;
          } else {
            ctx.context.options.emailAndPassword!.disableSignUp = true;
          }
        }
      } else if (ctx.path === '/sign-in/email') {
        throw new APIError('BAD_REQUEST', {
          code: 'MUST_SIGN_IN_WITH_USERNAME',
          message: 'You must sign in with your username.',
        });
      }
    }),
  },
});

// atlas schema inspect -u "sqlite://dev.db?_fk=1" > ./src/libs/db/schema.hcl
// atlas migrate diff init_better_auth --dir "file://src/libs/db/migrations" --to "file://src/libs/db/schema.hcl" --dev-url "sqlite://dev.db?_fk=1"
// atlas migrate lint --dev-url "sqlite://dev.db?_fk=1" --dir "file://src/libs/db/migrations" --latest 1
// atlas migrate apply --url "sqlite://dev.db?_fk=1" --dir "file://src/libs/db/migrations"
