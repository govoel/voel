import { Effect, Layer } from 'effect';
import { Aead, SecureRandom } from 'effect/crypto';

import {
  AccountEncryptionKey,
  AccountEncryptionKeyError,
} from '#src/domains/accounts/encryption/key.ts';

/** Upstream crypto with one lazily generated, layer-local key and no persistence. */
export const AccountEncryptionKeyTestLayer = Layer.effect(
  AccountEncryptionKey,
  Aead.Aead.use((aead) =>
    AccountEncryptionKey.make({
      loadKey: aead
        .generateKey(Aead.aes256Gcm)
        .pipe(Effect.catchTag('CryptoError', (cause) => AccountEncryptionKeyError.make({ cause }))),
    })
  )
).pipe(Layer.provideMerge(Aead.layerWebCrypto), Layer.provideMerge(SecureRandom.layerWebCrypto));
