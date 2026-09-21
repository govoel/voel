import { describe, expect, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import { AuthClientStorage } from '#src/services/auth-client/storage.ts';

describe('AuthClientStorage', () => {
  it.effect.each([{ value: null }, { value: 'session-token' }])(
    'retries a failed read and caches the recovered value $value',
    ({ value }) =>
      Effect.gen(function* () {
        const getItem = vi
          .fn(() => value)
          .mockImplementationOnce(() => {
            throw new Error('Secure storage temporarily unavailable');
          });
        const storage = yield* AuthClientStorage.make({
          getItem,
          setItem: () => void 0,
          removeItem: async () => void 0,
        });

        const error = yield* Effect.flip(storage.getItem('session'));
        expect(error._tag).toBe('AuthClientStorageGetItemError');
        expect(error.key).toBe('session');
        expect(yield* storage.getItem('session')).toEqual(Option.fromNullishOr(value));

        yield* TestClock.adjust('1 day');
        expect(yield* storage.getItem('session')).toEqual(Option.fromNullishOr(value));
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(getItem).toHaveBeenCalledWith('session');
      })
  );
});
