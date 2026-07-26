import { Cache, Context, Effect, Layer, Option, Schema } from 'effect';

export class AuthClientStorageGetItemError extends Schema.TaggedErrorClass<
  AuthClientStorageGetItemError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/storage/AuthClientStorageGetItemError')(
  'AuthClientStorageGetItemError',
  { key: Schema.String }
) {}

export class AuthClientStorageSetItemError extends Schema.TaggedErrorClass<
  AuthClientStorageSetItemError,
  { readonly brand: unique symbol }
>('voel/services/auth-client/storage/AuthClientStorageSetItemError')(
  'AuthClientStorageSetItemError',
  { key: Schema.String }
) {}

export class AuthClientStorage extends Context.Service<AuthClientStorage>()(
  'voel/services/auth-client/storage/AuthClientStorage',
  {
    make: Effect.fnUntraced(function* ({
      getItem,
      setItem,
    }: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
    }) {
      const cache = yield* Cache.make<string, Option.Option<string>, AuthClientStorageGetItemError>(
        {
          capacity: 8,
          lookup: (key) =>
            Effect.try({
              try: () => Option.fromNullishOr(getItem(key)),
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
              setItem(key, value);
            },
            catch: () => new AuthClientStorageSetItemError({ key }),
          });
          yield* Cache.set(cache, key, Option.some(value));
        }),
      };
    }),
  }
) {
  public static readonly layerTest = Layer.effect(
    this,
    Effect.sync(() => new Map<string, string>()).pipe(
      Effect.flatMap((items) =>
        this.make({
          getItem: (key) => items.get(key) ?? null,
          setItem: (key, value) => {
            items.set(key, value);
          },
        })
      )
    )
  );
}
