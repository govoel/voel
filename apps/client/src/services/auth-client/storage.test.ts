/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { AuthCredentialStorage } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { Account } from '#src/services/database/main/schema.ts';

it.effect(
  'credential cleanup converges after a partial failure and leaves other accounts intact',
  Effect.fnUntraced(
    function* () {
      const key = {
        serverUrl: Account.fields.serverUrl.make('https://EXAMPLE.com:443/'),
        authStorageId: Account.fields.authStorageId.make('storage-1'),
      };
      const xxHash = yield* XxHash;
      const prefix = yield* xxHash.hash128(`voel::auth::${key.serverUrl}::${key.authStorageId}`);
      const cookieKey = `${prefix}_cookie`;
      const sessionKey = `${prefix}_session_data`;
      const items = new Map([
        [cookieKey, 'cookie'],
        [sessionKey, 'session'],
        ['other-account_cookie', 'other'],
      ]);
      let failNextRemoval = true;
      const storage = yield* AuthClientStorage.make({
        getItem: (name) => items.get(name) ?? null,
        setItem: (name, value) => {
          items.set(name, value);
        },
        removeItem: async (name) => {
          if (name === sessionKey && failNextRemoval) {
            failNextRemoval = false;
            throw new Error('Storage temporarily unavailable');
          }
          items.delete(name);
        },
      });
      const credentials = yield* AuthCredentialStorage.make.pipe(
        Effect.provideService(AuthClientStorage, storage)
      );
      const error = yield* credentials.clear(key).pipe(Effect.flip);
      expect(error._tag).toBe('AuthClientStorageRemoveItemError');
      expect(items.has(cookieKey)).toBe(false);
      expect(items.has(sessionKey)).toBe(true);

      yield* credentials.clear(key);
      yield* credentials.clear(key);
      expect([...items]).toEqual([['other-account_cookie', 'other']]);
    },
    (effect) => effect.pipe(Effect.provide(XxHash.layerTest))
  )
);
