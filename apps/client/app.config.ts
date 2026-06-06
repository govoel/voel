import { Config, ConfigProvider, Context, Effect, Layer, Match } from 'effect';
import expoBuildProperties from 'expo-build-properties/plugin';
import expoFont from 'expo-font/plugin';
import expoImage from 'expo-image/plugin';
import expoRouter from 'expo-router/plugin/build';
import expoSecureStore from 'expo-secure-store/plugin/build';
import expoSplashScreen from 'expo-splash-screen/plugin';
import expoWebBrowser from 'expo-web-browser/plugin';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import pkg from './package.json';

class Env extends Context.Service<Env>()('voel/app.config/Env', {
  make: Config.all({
    releaseChannel: Config.literals(['prod', 'preview', 'dev'], 'RELEASE_CHANNEL').pipe(
      Config.withDefault('dev')
    ),
  }),
}) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))
  );
}

export default function app({ config }: ConfigContext): ExpoConfig {
  const env = Effect.runSync(Effect.service(Env).pipe(Effect.provide(Env.layer)));

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
        Match.when('prod', () => 'app.voel.rn'),
        Match.when('preview', () => 'app.voel.rn.preview'),
        Match.when('dev', () => 'app.voel.rn.dev'),
        Match.exhaustive
      ),
      icon: './assets/icons/ios-icon.icon',
      infoPlist: {
        UIBackgroundModes: ['audio'],
      },
    },
    android: {
      package: Match.value(env.releaseChannel).pipe(
        Match.when('prod', () => 'app.voel.rn'),
        Match.when('preview', () => 'app.voel.rn.preview'),
        Match.when('dev', () => 'app.voel.rn.dev'),
        Match.exhaustive
      ),
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptive-icon.png',
        monochromeImage: './assets/icons/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      predictiveBackGestureEnabled: true,
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
      expoSecureStore(),
      expoBuildProperties({
        android: { usesCleartextTraffic: true },
        // ios: { useFrameworks: 'static' },
      }),
      expoFont({
        android: {
          fonts: [
            {
              fontFamily: 'Google Sans',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/400Regular/GoogleSans_400Regular.ttf',
                  weight: 400,
                  style: 'normal',
                },
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/400Regular_Italic/GoogleSans_400Regular_Italic.ttf',
                  weight: 400,
                  style: 'italic',
                },
              ],
            },
            {
              fontFamily: 'Google Sans Medium',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/500Medium/GoogleSans_500Medium.ttf',
                  weight: 500,
                  style: 'normal',
                },
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/500Medium_Italic/GoogleSans_500Medium_Italic.ttf',
                  weight: 500,
                  style: 'italic',
                },
              ],
            },
            {
              fontFamily: 'Google Sans SemiBold',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/600SemiBold/GoogleSans_600SemiBold.ttf',
                  weight: 600,
                  style: 'normal',
                },
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/600SemiBold_Italic/GoogleSans_600SemiBold_Italic.ttf',
                  weight: 600,
                  style: 'italic',
                },
              ],
            },
            {
              fontFamily: 'Google Sans Bold',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/700Bold/GoogleSans_700Bold.ttf',
                  weight: 700,
                  style: 'normal',
                },
                {
                  path: 'node_modules/@expo-google-fonts/google-sans/700Bold_Italic/GoogleSans_700Bold_Italic.ttf',
                  weight: 700,
                  style: 'italic',
                },
              ],
            },
          ],
        },
      }),
      expoImage(),
      expoWebBrowser(),
      ['expo-plugin-ios-static-libraries', { libraries: ['op-sqlite'] }],
    ],

    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  };
}
