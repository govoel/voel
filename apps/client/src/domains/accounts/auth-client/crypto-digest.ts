import { Array, Context, Effect, Layer, String } from 'effect';

export class CryptoDigest extends Context.Service<CryptoDigest>()(
  'voel/domains/accounts/auth-client/crypto-digest/CryptoDigest',
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
        return Array.join(
          Array.map([...new Uint8Array(digest)], (byte) =>
            String.padStart(2, '0')(byte.toString(16))
          ),
          ''
        );
      }),
  });
}
