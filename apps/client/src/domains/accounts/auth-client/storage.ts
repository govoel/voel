import type { ExpoClientStorage } from '@better-auth/expo/client';
import { Cache, Duration, Effect, Exit } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

// Better Auth's native Expo plugin awaits its async callbacks, including getCookie
// and cache hydration. Never pretend an asynchronous database operation is sync.
const synchronousAccess = () => {
  throw new Error('Account credential storage requires asynchronous access');
};

export const makeMemoryAuthStorage = () => {
  const entries: Record<string, string> = {};
  return {
    storage: {
      getItem: synchronousAccess,
      setItem: synchronousAccess,
      getItemAsync: async (name) => entries[name] ?? null,
      setItemAsync: async (name, value) => {
        entries[name] = value;
      },
    } satisfies ExpoClientStorage,
    snapshot: () => ({ ...entries }),
  };
};

export const makeAccountAuthStorage = Effect.fnUntraced(function* (key: AccountKey) {
  const repository = yield* AccountRepository;
  const reactivity = yield* Reactivity.Reactivity;
  const cache = yield* Cache.makeWith(
    (name: string) =>
      repository.readAuthStorage(key).pipe(Effect.map((entries) => entries[name] ?? null)),
    {
      capacity: 8,
      // Cache missing entries too, but retry transient storage failures.
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    }
  );
  const context = yield* Effect.context();
  const runSync = Effect.runSyncWith(context);
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      reactivity.registerUnsafe(['account'], () => {
        runSync(Cache.invalidateAll(cache));
      })
    ),
    Effect.sync
  );
  const runPromise = Effect.runPromiseWith(context);
  return {
    getItem: synchronousAccess,
    setItem: synchronousAccess,
    getItemAsync: async (name) => runPromise(Cache.get(cache, name)),
    setItemAsync: async (name, value) =>
      runPromise(
        repository
          .writeAuthStorageItem({ key, name, value })
          .pipe(Effect.andThen(Cache.set(cache, name, value)))
      ),
  } satisfies ExpoClientStorage;
});
