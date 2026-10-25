import type { ExpoClientStorage } from '@better-auth/expo/client';
import { Effect } from 'effect';

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
  const run = Effect.runPromiseWith(yield* Effect.context());
  return {
    getItem: synchronousAccess,
    setItem: synchronousAccess,
    getItemAsync: async (name) =>
      run(repository.readAuthStorage(key).pipe(Effect.map((entries) => entries[name] ?? null))),
    setItemAsync: async (name, value) => run(repository.writeAuthStorageItem({ key, name, value })),
  } satisfies ExpoClientStorage;
});
