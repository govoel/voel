import { withRozenite } from '@rozenite/metro';
import { Config, ConfigProvider, Context, Effect, Layer } from 'effect';
// Learn more https://docs.expo.io/guides/customizing-metro
import { getDefaultConfig } from 'expo/metro-config.js';

/** @type {Context.ServiceClass<Env, 'voel/metro.config/Env', { releaseChannel: 'prod' | 'preview' | 'dev' }> & { layer: Layer.Layer<Env> }} */
const Env = class extends Context.Service()('voel/metro.config/Env', {
  make: Config.all({
    releaseChannel: Config.literals(['prod', 'preview', 'dev'], 'RELEASE_CHANNEL').pipe(
      Config.withDefault('dev')
    ),
  }),
}) {
  static layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );
};

/** @type {import('expo/metro-config').MetroConfig} */
// oxlint-disable-next-line typescript/no-unsafe-argument
const config = withRozenite(getDefaultConfig(import.meta.dirname), {
  enabled: Effect.runSync(
    Effect.service(Env).pipe(
      Effect.map((env) => env.releaseChannel === 'dev'),
      Effect.provide(Env.layer)
    )
  ),
  include: ['@repo/atom-devtools-plugin'],
});

export default config;
