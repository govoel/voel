import { Context, Effect, Layer } from 'effect';

export class XxHash extends Context.Service<
  XxHash,
  { readonly hash128: (input: string) => Effect.Effect<string> }
>()('voel/services/auth-client/xxhash') {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const { hash128 } = yield* Effect.promise(async () => import('react-native-xxhash'));
      return Layer.succeed(XxHash, {
        hash128: (input) => Effect.sync(() => hash128(input)),
      });
    })
  );

  public static readonly layerTest = Layer.succeed(this, {
    hash128: (input) => Effect.succeed(`test-${input.replaceAll(':', '-')}`),
  });
}
