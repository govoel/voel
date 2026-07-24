import { Context, Effect, Layer, Option, Schema } from 'effect';

import { AccountManager } from '#src/services/accounts/index.ts';
import type { VoelAuthClient } from '#src/services/auth-client/index.ts';

class BetterAuthOriginalError extends Schema.Class<
  BetterAuthOriginalError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/index/BetterAuthOriginalError')({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.Number,
  statusText: Schema.String,
}) {}

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

const betterAuthOriginalErrorFromUnknown = (error: unknown) =>
  error instanceof Error
    ? new BetterAuthOriginalError({
        message: error.message,
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      })
    : new BetterAuthOriginalError({
        message: 'An unknown error occurred.',
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      });

export class CurrentAuthClient extends Context.Service<CurrentAuthClient>()(
  'voel/services/auth-client/current/CurrentAuthClient',
  {
    make: Effect.gen(function* () {
      const accountManager = yield* AccountManager;

      const getCurrentAuthClient = Effect.fnUntraced(function* () {
        const state = yield* accountManager.state;
        if (Option.isNone(state)) {
          return yield* new NoCurrentAuthClientError();
        }

        return state.value.state.authClient;
      });

      const updateUser = Effect.fnUntraced(function* (
        input: Parameters<VoelAuthClient['updateUser']>[0]
      ) {
        const authClient = yield* getCurrentAuthClient();
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
      });

      const getCookie = Effect.fnUntraced(function* () {
        const authClient = yield* getCurrentAuthClient();
        return authClient.getCookie();
      });

      const listUsers = Effect.fnUntraced(function* (
        input: Parameters<VoelAuthClient['admin']['listUsers']>[0]
      ) {
        const authClient = yield* getCurrentAuthClient();
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
      });

      return { getCookie, listUsers, updateUser };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
