import { Context, Effect, Layer } from 'effect';

export class CryptoDigest extends Context.Service<CryptoDigest>()(
  'voel/services/auth-client/crypto-digest/CryptoDigest',
  {
    make: Effect.gen(function* () {
      const { digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding } = yield* Effect.promise(
        async () => import('expo-crypto')
      );
      return {
        sha256: ({ input }: { readonly input: string }) =>
          Effect.promise(async () =>
            digestStringAsync(CryptoDigestAlgorithm.SHA256, input, { encoding: CryptoEncoding.HEX })
          ),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);

  public static readonly layerTest = Layer.succeed(this, {
    sha256: ({ input }) =>
      Effect.promise(async () => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        return Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join('');
      }),
  });
}
