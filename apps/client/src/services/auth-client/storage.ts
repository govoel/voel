import { Cache, Context, Effect, Layer, Option } from 'effect';
import * as SecureStore from 'expo-secure-store';

export class AuthClientStorage extends Context.Service<AuthClientStorage>()(
  'voel/services/auth-client/storage/AuthClientStorage',
  {
    make: Effect.gen(function* () {
      const cache = yield* Cache.make<string, Option.Option<string>>({
        capacity: 8,
        lookup: (key) => Effect.sync(() => Option.fromNullishOr(SecureStore.getItem(key))),
      });

      return {
        getItem: Effect.fnUntraced(function* (key: string) {
          return yield* Cache.get(cache, key);
        }),

        setItem: Effect.fnUntraced(function* (key: string, value: string) {
          yield* Effect.sync(() => {
            SecureStore.setItem(key, value);
          });
          yield* Cache.set(cache, key, Option.some(value));
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
