import { Effect, Layer } from 'effect';
import { Aead, SecureRandom } from 'effect/crypto';

import {
  AccountEncryptionKey,
  AccountEncryptionKeyError,
} from '#src/domains/accounts/encryption/key.ts';

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
