import { Cache, Context, Duration, Effect, Exit, Layer, Option, Schema } from 'effect';

class AuthClientStorageGetItemError extends Schema.TaggedError<
  AuthClientStorageGetItemError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/storage/AuthClientStorageGetItemError')(
  'AuthClientStorageGetItemError',
  { key: Schema.String }
) {}

class AuthClientStorageSetItemError extends Schema.TaggedError<
  AuthClientStorageSetItemError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/storage/AuthClientStorageSetItemError')(
  'AuthClientStorageSetItemError',
  { key: Schema.String }
) {}

export class AuthClientStorageRemoveItemError extends Schema.TaggedError<
  AuthClientStorageRemoveItemError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/storage/AuthClientStorageRemoveItemError')(
  'AuthClientStorageRemoveItemError',
  { key: Schema.String }
) {}

export class AuthClientStorage extends Context.Service<AuthClientStorage>()(
  'voel/services/auth-client/storage/AuthClientStorage',
  {
    make: Effect.fnUntraced(function* ({
      getItem,
      setItem,
      removeItem,
    }: {
      readonly getItem: (key: string) => string | null;
      readonly setItem: (key: string, value: string) => void;
      readonly removeItem: (key: string) => Promise<void>;
    }) {
      const cache = yield* Cache.makeWith(
        (key: string) =>
          Effect.try({
            try: () => Option.fromNullishOr(getItem(key)),
            catch: () => AuthClientStorageGetItemError.make({ key }),
          }),
        {
          capacity: 8,
          // Keep successful reads until updated, but let transient storage failures retry.
          timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
        }
      );

      return {
        getItem: Effect.fnUntraced(function* (key: string) {
          return yield* Cache.get(cache, key);
        }),

        setItem: Effect.fnUntraced(function* (key: string, value: string) {
          yield* Effect.try({
            try: () => {
              setItem(key, value);
            },
            catch: () => AuthClientStorageSetItemError.make({ key }),
          });
          yield* Cache.set(cache, key, Option.some(value));
        }),

        removeItem: Effect.fnUntraced(function* (key: string) {
          yield* Effect.tryPromise({
            try: async () => {
              await removeItem(key);
            },
            catch: () => AuthClientStorageRemoveItemError.make({ key }),
          });
          yield* Cache.set(cache, key, Option.none());
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const SecureStore = yield* Effect.promise(async () => import('expo-secure-store'));
      return Layer.effect(
        AuthClientStorage,
        AuthClientStorage.make({
          getItem: SecureStore.getItem,
          setItem: SecureStore.setItem,
          removeItem: SecureStore.deleteItemAsync,
        })
      );
    })
  );

  public static readonly layerTest = (items: Map<string, string>) =>
    Layer.effect(
      this,
      this.make({
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
          items.set(key, value);
        },
        removeItem: async (key) => {
          items.delete(key);
        },
      })
    );
}
