import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { AuthClientStorage } from '#src/services/auth-client/storage.ts';

describe('AuthClientStorage', () => {
  it.effect('reads the latest value after writes and removals', () =>
    Effect.gen(function* () {
      const items = new Map([['cookie', 'original']]);
      const storage = yield* AuthClientStorage.make({
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => {
          items.set(key, value);
        },
        removeItem: async (key) => {
          items.delete(key);
        },
      });

      expect(yield* storage.getItem('cookie')).toEqual(Option.some('original'));
      yield* storage.setItem('cookie', 'rotated');
      expect(items.get('cookie')).toBe('rotated');
      expect(yield* storage.getItem('cookie')).toEqual(Option.some('rotated'));
      yield* storage.removeItem('cookie');
      expect(items.has('cookie')).toBe(false);
      expect(yield* storage.getItem('cookie')).toEqual(Option.none());
    })
  );

  it.effect.each([{ value: null }, { value: 'session-token' }])(
    'recovers from a failed read with value $value',
    ({ value }) =>
      Effect.gen(function* () {
        let unavailable = true;
        const storage = yield* AuthClientStorage.make({
          getItem: () => {
            if (unavailable) {
              throw new Error('Secure storage temporarily unavailable');
            }
            return value;
          },
          setItem: () => void 0,
          removeItem: async () => void 0,
        });

        const error = yield* Effect.flip(storage.getItem('session'));
        expect(error._tag).toBe('AuthClientStorageGetItemError');
        expect(error.key).toBe('session');
        unavailable = false;
        expect(yield* storage.getItem('session')).toEqual(Option.fromNullishOr(value));
      })
  );
});
