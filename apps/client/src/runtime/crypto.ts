import { Effect, Layer, Match } from 'effect';
import { Aead, CryptoError, Digest, SecureRandom } from 'effect/crypto';
import { Hex } from 'effect/encoding';

/** Native hashing for Hermes, which does not provide Web Crypto's SubtleCrypto. */
export const ExpoDigestLayer = Layer.effect(
  Digest.Digest,
  Effect.gen(function* () {
    const crypto = yield* Effect.promise(async () => import('expo-crypto'));
    const digest = Effect.fnUntraced(function* (algorithm: Digest.Algorithm, data: Uint8Array) {
      if (algorithm.implementation !== void 0) {
        return algorithm.implementation(data);
      }
      const nativeAlgorithm = Match.value(algorithm.name).pipe(
        Match.literalsExhaustive({
          MD5: () => crypto.CryptoDigestAlgorithm.MD5,
          'SHA-1': () => crypto.CryptoDigestAlgorithm.SHA1,
          'SHA-256': () => crypto.CryptoDigestAlgorithm.SHA256,
          'SHA-384': () => crypto.CryptoDigestAlgorithm.SHA384,
          'SHA-512': () => crypto.CryptoDigestAlgorithm.SHA512,
        })
      );
      return new Uint8Array(
        yield* Effect.promise(async () => crypto.digest(nativeAlgorithm, new Uint8Array(data)))
      );
    });
    return {
      digest,
      digestHex: (algorithm, data) => digest(algorithm, data).pipe(Effect.map(Hex.encode)),
    };
  })
);

/** Native secure randomness, without Expo's development-only Math.random fallback. */
export const ExpoSecureRandomLayer = Layer.effect(
  SecureRandom.SecureRandom,
  Effect.gen(function* () {
    const crypto = yield* Effect.promise(async () => import('expo-crypto'));
    return SecureRandom.make((size) => {
      const bytes = new Uint8Array(size);
      for (let offset = 0; offset < size; offset += 65_536) {
        crypto.getRandomValues(bytes.subarray(offset, offset + 65_536));
      }
      return bytes;
    });
  })
);

/** Expo AES-GCM; key generation and non-AES algorithms use upstream implementations. */
export const ExpoAeadLayer = Layer.effect(
  Aead.Aead,
  Effect.gen(function* () {
    const core = yield* Aead.Aead;
    const crypto = yield* Effect.promise(async () => import('expo-crypto'));
    const keys = new WeakMap<
      Aead.Key,
      Awaited<ReturnType<typeof crypto.AESEncryptionKey.import>>
    >();
    const run = Effect.fnUntraced(function* ({
      method,
      key,
      data,
      options,
    }: {
      readonly method: 'encrypt' | 'decrypt';
      readonly key: Aead.Key;
      readonly data: Uint8Array;
      readonly options: Parameters<Aead.Aead['Service']['encrypt']>[2];
    }) {
      if (key.algorithm.implementation !== void 0) {
        return yield* core[method](key, data, options);
      }
      if (options.nonce.length !== key.algorithm.nonceLength) {
        return yield* new CryptoError.CryptoError({
          module: 'Aead',
          method,
          reason: new CryptoError.InvalidArgument({
            description: 'AES-GCM nonces must contain exactly 12 bytes',
          }),
        });
      }
      if (method === 'encrypt' && data.length > 2 ** 36 - 32) {
        return yield* new CryptoError.CryptoError({
          module: 'Aead',
          method,
          reason: new CryptoError.InvalidArgument({
            description: 'AES-GCM plaintext cannot exceed 2^36 - 32 bytes',
          }),
        });
      }
      if (method === 'decrypt' && data.length < 16) {
        return yield* new CryptoError.CryptoError({
          module: 'Aead',
          method,
          reason: new CryptoError.DecryptionFailed(),
        });
      }
      let nativeKey = keys.get(key);
      if (nativeKey === void 0) {
        const bytes = yield* Aead.toBytes(key);
        nativeKey = yield* Effect.tryPromise({
          try: async () => {
            try {
              return await crypto.AESEncryptionKey.import(bytes);
            } finally {
              bytes.fill(0);
            }
          },
          catch: (cause) =>
            new CryptoError.CryptoError({
              module: 'Aead',
              method,
              reason: new CryptoError.InvalidKey({
                description: 'Unable to import AES key',
                cause,
              }),
            }),
        });
        keys.set(key, nativeKey);
      }
      const aesKey = nativeKey;
      return yield* Effect.tryPromise({
        try: async () => {
          if (method === 'encrypt') {
            const sealed = await crypto.aesEncryptAsync(data, aesKey, {
              nonce: { bytes: options.nonce },
              tagLength: 16,
              ...(options.aad !== void 0 ? { additionalData: options.aad } : {}),
            });
            return sealed.ciphertext({ includeTag: true });
          }
          return crypto.aesDecryptAsync(
            crypto.AESSealedData.fromParts(options.nonce, data, 16),
            aesKey,
            options.aad !== void 0 ? { additionalData: options.aad } : {}
          );
        },
        catch: (cause) =>
          new CryptoError.CryptoError({
            module: 'Aead',
            method,
            reason:
              method === 'decrypt'
                ? new CryptoError.DecryptionFailed()
                : new CryptoError.InvalidArgument({
                    description: 'Unable to encrypt with AES-GCM',
                    cause,
                  }),
          }),
      });
    });
    return Aead.Aead.of({
      generateKey: core.generateKey,
      encrypt: (key, data, options) => run({ method: 'encrypt', key, data, options }),
      decrypt: (key, data, options) => run({ method: 'decrypt', key, data, options }),
    });
  })
).pipe(Layer.provide(Aead.layerWebCrypto), Layer.provide(ExpoSecureRandomLayer));
