/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Effect, String } from 'effect';

import { AuthEncryption } from '#src/domains/accounts/auth-client/encryption.ts';
import { makeMemoryAuthStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { EncryptedAuthStorage } from '#src/domains/accounts/schema.ts';

describe('credential storage', () => {
  it('keeps temporary authentication isolated and snapshots all storage entries', async () => {
    const first = makeMemoryAuthStorage();
    const second = makeMemoryAuthStorage();
    await first.storage.setItemAsync('voel_cookie', 'a cookie');
    const snapshot = first.snapshot();
    await first.storage.setItemAsync('voel_cookie', 'a rotated cookie');
    expect(snapshot).toEqual({ voel_cookie: 'a cookie' });
    expect(await second.storage.getItemAsync('voel_cookie')).toBeNull();
  });
  it.effect(
    'round-trips Unicode and chunk entries, randomizes ciphertext, and rejects tampering',
    Effect.fnUntraced(function* () {
      const encryption = yield* AuthEncryption;
      const data = {
        voel_cookie: String.repeat(1000)('秘密🔐'),
        'voel_cookie.0.0': 'chunk',
        voel_session_data: '{}',
      };
      const context = 'an-account-identity';
      const first = yield* encryption.encrypt({ data, context });
      const second = yield* encryption.encrypt({ data, context });
      expect(first).not.toBe(second);
      expect(first).not.toContain('秘密');
      expect(yield* encryption.decrypt({ data: first, context })).toEqual(data);
      const tampered = EncryptedAuthStorage.make(
        (String.startsWith('A')(first) ? 'B' : 'A') + String.slice(1)(first)
      );
      expect(
        yield* encryption.decrypt({ data: tampered, context }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'AccountCredentialsError' });
    }, Effect.provide(AuthEncryption.layerTest))
  );
});
