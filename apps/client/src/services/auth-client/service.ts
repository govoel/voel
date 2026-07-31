import { Context, Effect, Layer, LayerMap, Option, Schema } from 'effect';

import type { Selectable } from '@repo/effect-kysely';

import { AccountManager } from '#src/services/accounts/index.ts';
import {
  BetterAuthErrorDetails,
  betterAuthErrorDetailsFromUnknown,
} from '#src/services/auth-client/errors.ts';
import type { VoelAuthClient } from '#src/services/auth-client/index.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

type Account = Selectable<AccountTable>;

export type AuthClientKey = readonly [serverUrl: Account['serverUrl'], userId: Account['userId']];

export const authClientKey = ({
  serverUrl,
  userId,
}: Pick<Account, 'serverUrl' | 'userId'>): AuthClientKey => [serverUrl, userId];

export class NoCurrentAuthClientError extends Schema.TaggedErrorClass<
  NoCurrentAuthClientError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/service/NoCurrentAuthClientError')('NoCurrentAuthClientError', {}) {}

export class AuthClientRequestError extends Schema.TaggedErrorClass<
  AuthClientRequestError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/service/AuthClientRequestError')('AuthClientRequestError', {
  details: BetterAuthErrorDetails,
}) {}

export class AuthClient extends Context.Service<AuthClient>()(
  'voel/services/auth-client/service/AuthClient',
  {
    make: (getAuthClient: Effect.Effect<VoelAuthClient, NoCurrentAuthClientError>) =>
      Effect.succeed({
        getCookie: getAuthClient.pipe(Effect.map((client) => client.getCookie())),

        admin: {
          listUsers: Effect.fn('AuthClient.admin.listUsers')(function* (
            input: Parameters<VoelAuthClient['admin']['listUsers']>[0]
          ) {
            const client = yield* getAuthClient;
            const result = yield* Effect.tryPromise({
              try: async () => client.admin.listUsers(input),
              catch: (error) =>
                new AuthClientRequestError({
                  details: betterAuthErrorDetailsFromUnknown(error),
                }),
            });

            if (result.error !== null) {
              return yield* new AuthClientRequestError({
                details: new BetterAuthErrorDetails(result.error),
              });
            }

            return result.data;
          }),
        },

        updateUser: Effect.fn('AuthClient.updateUser')(function* (
          input: Parameters<VoelAuthClient['updateUser']>[0]
        ) {
          const client = yield* getAuthClient;
          const result = yield* Effect.tryPromise({
            try: async () => client.updateUser(input),
            catch: (error) =>
              new AuthClientRequestError({
                details: betterAuthErrorDetailsFromUnknown(error),
              }),
          });

          if (result.error !== null) {
            return yield* new AuthClientRequestError({
              details: new BetterAuthErrorDetails(result.error),
            });
          }

          return result.data;
        }),
      }),
  }
) {
  public static readonly layer = (
    getAuthClient: Effect.Effect<VoelAuthClient, NoCurrentAuthClientError>
  ) => Layer.effect(this, this.make(getAuthClient));
}

export class AuthClientMap extends LayerMap.Service<AuthClientMap>()(
  'voel/services/auth-client/service/AuthClientMap',
  {
    lookup: ([serverUrl, userId]: AuthClientKey) =>
      Layer.effect(
        AuthClient,
        Effect.gen(function* () {
          const accountManager = yield* AccountManager;
          const getAuthClient = accountManager.state.pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => new NoCurrentAuthClientError(),
                onSome: ({ account, state }) =>
                  account.serverUrl === serverUrl && account.userId === userId
                    ? Effect.succeed(state.authClient)
                    : new NoCurrentAuthClientError(),
              })
            )
          );
          return yield* AuthClient.make(getAuthClient);
        })
      ),
  }
) {}
