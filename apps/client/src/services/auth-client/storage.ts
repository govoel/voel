import { Cache, Context, Effect, Layer, Option, Schema } from 'effect';
import * as SecureStore from 'expo-secure-store';

export class AuthClientStorageGetItemError extends Schema.TaggedErrorClass<AuthClientStorageGetItemError>()(
  'voel/services/auth-client/storage/AuthClientStorageGetItemError',
  { key: Schema.String }
) {}

export class AuthClientStorageSetItemError extends Schema.TaggedErrorClass<AuthClientStorageSetItemError>()(
  'voel/services/auth-client/storage/AuthClientStorageSetItemError',
  { key: Schema.String }
) {}

export class AuthClientStorage extends Context.Service<AuthClientStorage>()(
  'voel/services/auth-client/storage/AuthClientStorage',
  {
    make: Effect.gen(function* () {
      const cache = yield* Cache.make<string, Option.Option<string>, AuthClientStorageGetItemError>(
        {
          capacity: 8,
          lookup: (key) =>
            Effect.try({
              try: () => Option.fromNullishOr(SecureStore.getItem(key)),
              catch: () => new AuthClientStorageGetItemError({ key }),
            }),
        }
      );

      return {
        getItem: Effect.fnUntraced(function* (key: string) {
          return yield* Cache.get(cache, key);
        }),

        setItem: Effect.fnUntraced(function* (key: string, value: string) {
          yield* Effect.try({
            try: () => {
              SecureStore.setItem(key, value);
            },
            catch: () => new AuthClientStorageSetItemError({ key }),
          });
          yield* Cache.set(cache, key, Option.some(value));
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
