import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';

import { Encryption, EncryptionError } from '#src/domains/accounts/encryption/index.ts';

describe('encryption key initialization', () => {
  it.effect(
    'shares lazy initialization across operations, including when a caller is cancelled',
    Effect.fnUntraced(function* () {
      const started = yield* Deferred.make<true>();
      const persisted = yield* Deferred.make<true>();
      let attempts = 0;
      const encryption = yield* Encryption.make({
        loadKey: Effect.gen(function* () {
          attempts += 1;
          yield* Deferred.succeed(started, true);
          yield* Deferred.await(persisted);
          return 'persisted-key';
        }),
        encrypt: ({ key }) => Effect.succeed(key),
        decrypt: ({ key }) =>
          Effect.sync(() => {
            expect(key).toBe('persisted-key');
            return new TextEncoder().encode('{}');
          }),
      });
      expect(attempts).toBe(0);

      const first = yield* encryption
        .encrypt({ plaintext: new Uint8Array() })
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      const cancelling = yield* Fiber.interrupt(first).pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      const encrypting = yield* encryption
        .encrypt({ plaintext: new Uint8Array() })
        .pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      expect(attempts).toBe(1);

      yield* Deferred.succeed(persisted, true);
      yield* Fiber.join(cancelling);
      const data = yield* Fiber.join(encrypting);
      expect(data).toBe('persisted-key');
      expect(yield* encryption.decrypt({ ciphertext: data })).toEqual(
        new TextEncoder().encode('{}')
      );
      yield* encryption.encrypt({ plaintext: new Uint8Array() });
      expect(attempts).toBe(1);
    })
  );

  it.effect(
    'surfaces initialization failures and retries on the next operation',
    Effect.fnUntraced(function* () {
      let attempts = 0;
      const error = EncryptionError.make({ cause: new Error('SecureStore unavailable') });
      const encryption = yield* Encryption.make({
        loadKey: Effect.suspend(() => {
          attempts += 1;
          return attempts === 1 ? Effect.fail(error) : Effect.succeed('persisted-key');
        }),
        encrypt: ({ key }) => Effect.succeed(key),
        decrypt: () => Effect.succeed(new TextEncoder().encode('{}')),
      });

      expect(yield* encryption.decrypt({ ciphertext: 'ciphertext' }).pipe(Effect.flip)).toBe(error);
      expect(attempts).toBe(1);
      const data = yield* encryption.encrypt({ plaintext: new Uint8Array() });
      expect(data).toBe('persisted-key');
      expect(yield* encryption.decrypt({ ciphertext: data })).toEqual(
        new TextEncoder().encode('{}')
      );
      yield* encryption.encrypt({ plaintext: new Uint8Array() });
      expect(attempts).toBe(2);
    })
  );
});
