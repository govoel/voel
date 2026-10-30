import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Digest } from 'effect/crypto';
import { Hex } from 'effect/encoding';
import { vi } from 'vitest';

import { ExpoDigestLayer } from '#src/runtime/crypto.ts';

// Exercise the Expo adapter without loading native modules in Bun.
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    MD5: 'MD5',
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
  },
  digest: async (algorithm: string, data: Uint8Array<ArrayBuffer>) =>
    crypto.subtle.digest(algorithm, data),
}));

it.layer(ExpoDigestLayer)('Expo digest', (iit) => {
  iit.effect(
    'hashes bytes and lowercase hex with the standard digest algorithms',
    Effect.fnUntraced(function* () {
      const digest = yield* Digest.Digest;
      const data = new TextEncoder().encode('abc');
      expect(yield* digest.digestHex(Digest.sha256, data)).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      );
      expect(yield* digest.digestHex(Digest.md5, data)).toBe('900150983cd24fb0d6963f7d28e17f72');
      for (const algorithm of [Digest.sha1, Digest.sha256, Digest.sha384, Digest.sha512]) {
        const expected = new Uint8Array(
          yield* Effect.promise(async () => crypto.subtle.digest(algorithm.name, data))
        );
        expect(yield* digest.digest(algorithm, data)).toEqual(expected);
        expect(yield* digest.digestHex(algorithm, data)).toBe(Hex.encode(expected));
      }
    })
  );

  iit.effect(
    'hashes only the supplied byte view, including UTF-8 input',
    Effect.fnUntraced(function* () {
      const digest = yield* Digest.Digest;
      const data = new TextEncoder().encode('!voël 📚!');
      const view = data.subarray(1, -1);
      const expected = new Uint8Array(
        yield* Effect.promise(async () =>
          crypto.subtle.digest('SHA-256', new TextEncoder().encode('voël 📚'))
        )
      );
      expect(yield* digest.digest(Digest.sha256, view)).toEqual(expected);
    })
  );
});
