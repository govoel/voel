import { Config, ConfigProvider, Context, Effect, Layer } from 'effect';

export class Env extends Context.Service<Env>()('voel/env', {
  make: Effect.gen(function* () {
    const releaseChannel = yield* Config.literals(
      ['prod', 'preview', 'dev'],
      'RELEASE_CHANNEL'
    ).pipe(Config.withDefault('dev'));

    return {
      releaseChannel,
      rozeniteEnabled: releaseChannel === 'dev',
    };
  }),
}) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );
}
