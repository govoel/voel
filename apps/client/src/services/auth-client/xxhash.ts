import { Context, Effect, Layer } from 'effect';

export class XxHash extends Context.Service<XxHash>()('voel/services/auth-client/xxhash', {
  make: Effect.gen(function* () {
    const { hash128 } = yield* Effect.promise(async () => import('react-native-xxhash'));
    return { hash128: (input: string) => Effect.sync(() => hash128(input)) };
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make);

  public static readonly layerTest = Layer.succeed(this, {
    hash128: (input) => Effect.succeed(`test-${input.replaceAll(':', '-')}`),
  });
}
