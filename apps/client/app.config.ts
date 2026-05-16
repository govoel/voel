import { Config, ConfigProvider, Context, Effect, Layer, Match } from 'effect';
import expoBuildProperties from 'expo-build-properties/plugin';
import expoRouter from 'expo-router/plugin/build';
import expoSplashScreen from 'expo-splash-screen/plugin';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import pkg from './package.json';

class Env extends Context.Service<Env>()('voel/app.config/Env', {
  make: Effect.gen(function* () {
    return yield* Config.all({
      releaseChannel: Config.literals(['prod', 'preview', 'dev'], 'RELEASE_CHANNEL').pipe(
        Config.withDefault('dev')
      ),
    });
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );
}

export default function app({ config }: ConfigContext): ExpoConfig {
  const env = Effect.runSync(Env.use((e) => Effect.succeed(e)).pipe(Effect.provide(Env.layer)));

  return {
    ...config,
    name: Match.value(env.releaseChannel).pipe(
      Match.when('prod', () => 'Voel'),
      Match.when('preview', () => 'Voel (Preview)'),
      Match.when('dev', () => 'Voel (Dev)'),
      Match.exhaustive
    ),
    slug: Match.value(env.releaseChannel).pipe(
      Match.when('prod', () => 'voel'),
      Match.when('preview', () => 'voel-preview'),
      Match.when('dev', () => 'voel-dev'),
      Match.exhaustive
    ),
    scheme: Match.value(env.releaseChannel).pipe(
      Match.when('prod', () => 'voel'),
      Match.when('preview', () => 'voel-preview'),
      Match.when('dev', () => 'voel-dev'),
      Match.exhaustive
    ),
    version: pkg.version,
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',

    ios: {
      supportsTablet: false,
      bundleIdentifier: Match.value(env.releaseChannel).pipe(
        Match.when('prod', () => 'app.voel.ios'),
        Match.when('preview', () => 'app.voel.ios.preview'),
        Match.when('dev', () => 'app.voel.ios.dev'),
        Match.exhaustive
      ),
      icon: './assets/icons/ios-icon.icon',
      infoPlist: {
        UIBackgroundModes: ['audio'],
      },
    },
    android: {
      package: Match.value(env.releaseChannel).pipe(
        Match.when('prod', () => 'app.voel.android'),
        Match.when('preview', () => 'app.voel.android.preview'),
        Match.when('dev', () => 'app.voel.android.dev'),
        Match.exhaustive
      ),
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        monochromeImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      predictiveBackGestureEnabled: false,
    },

    plugins: [
      expoRouter({ adaptiveColors: true }),
      expoSplashScreen({
        backgroundColor: '#ffffff',
        image: './assets/icons/splash-icon-dark.png',
        dark: {
          backgroundColor: '#000000',
          image: './assets/icons/splash-icon-light.png',
        },
        imageWidth: 200,
      }),
      expoBuildProperties({
        android: { usesCleartextTraffic: true },
        // ios: { useFrameworks: 'static' },
      }),
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
}
