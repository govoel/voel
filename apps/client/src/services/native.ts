import { Context, Effect, Layer, Random } from 'effect';

export class UuidGenerator extends Context.Service<
  UuidGenerator,
  { readonly v4: Effect.Effect<string> }
>()('voel/services/native/UuidGenerator') {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const { uuid } = yield* Effect.promise(async () => import('expo-modules-core'));
      return Layer.succeed(UuidGenerator, {
        v4: Effect.sync(() => uuid.v4()),
      });
    })
  );

  public static readonly layerTest = Layer.succeed(this, {
    v4: Effect.all([Random.nextInt, Random.nextInt]).pipe(
      Effect.map(([left, right]) => `test-${Math.abs(left)}-${Math.abs(right)}`)
    ),
  });
}

export class XxHash extends Context.Service<
  XxHash,
  { readonly hash128: (input: string) => Effect.Effect<string> }
>()('voel/services/native/XxHash') {
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
