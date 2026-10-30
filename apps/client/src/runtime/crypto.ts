import { Effect, Layer, Match } from 'effect';
import { Digest } from 'effect/crypto';
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
