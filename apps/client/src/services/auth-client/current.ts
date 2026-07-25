import { Context, Effect, Layer, Option, Schema } from 'effect';

import { AccountManager } from '#src/services/accounts/index.ts';
import {
  BetterAuthOriginalError,
  betterAuthOriginalErrorFromUnknown,
} from '#src/services/auth-client/errors.ts';
import type { VoelAuthClient } from '#src/services/auth-client/index.ts';

export class NoCurrentAuthClientError extends Schema.TaggedErrorClass<
  NoCurrentAuthClientError,
  { readonly brand: unique symbol }
>()('voel/services/auth-client/current/NoCurrentAuthClientError', {}) {}

class CurrentAuthClientRequestError extends Schema.TaggedErrorClass<
  CurrentAuthClientRequestError,
  { readonly brand: unique symbol }
>()('voel/services/auth-client/current/CurrentAuthClientRequestError', {
  original: BetterAuthOriginalError,
}) {}

export class CurrentAuthClient extends Context.Service<CurrentAuthClient>()(
  'voel/services/auth-client/current/CurrentAuthClient',
  {
    make: Effect.gen(function* () {
      const accountManager = yield* AccountManager;

      const getCurrentAuthClient = Effect.gen(function* () {
        const state = yield* accountManager.state;
        if (Option.isNone(state)) {
          return yield* new NoCurrentAuthClientError();
        }

        return state.value.state.authClient;
      });

      return {
        getCookie: getCurrentAuthClient.pipe(Effect.map((authClient) => authClient.getCookie())),

        admin: {
          listUsers: Effect.fnUntraced(function* (
            input: Parameters<VoelAuthClient['admin']['listUsers']>[0]
          ) {
            const authClient = yield* getCurrentAuthClient;
            const result = yield* Effect.tryPromise({
              try: async () => authClient.admin.listUsers(input),
              catch: (error) =>
                new CurrentAuthClientRequestError({
                  original: betterAuthOriginalErrorFromUnknown(error),
                }),
            });

            if (result.error !== null) {
              return yield* new CurrentAuthClientRequestError({
                original: new BetterAuthOriginalError(result.error),
              });
            }

            return result.data;
          }),
        },

        updateUser: Effect.fnUntraced(function* (
          input: Parameters<VoelAuthClient['updateUser']>[0]
        ) {
          const authClient = yield* getCurrentAuthClient;
          const result = yield* Effect.tryPromise({
            try: async () => authClient.updateUser(input),
            catch: (error) =>
              new CurrentAuthClientRequestError({
                original: betterAuthOriginalErrorFromUnknown(error),
              }),
          });

          if (result.error !== null) {
            return yield* new CurrentAuthClientRequestError({
              original: new BetterAuthOriginalError(result.error),
            });
          }

          return result.data;
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
