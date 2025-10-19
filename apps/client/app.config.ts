import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name:
    process.env.RELEASE_CHANNEL === 'development'
      ? 'Voel (Dev)'
      : process.env.RELEASE_CHANNEL === 'preview'
        ? 'Voel (Preview)'
        : 'Voel',
  slug: 'voel',
  scheme: 'voel',
  version: '0.0.0-mvp',
  newArchEnabled: true,
  platforms: ['ios', 'android'],
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-localization',
    'react-native-bottom-tabs',
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/VoelInter-Bold.otf',
          './assets/fonts/VoelInter-Thin.otf',
          './assets/fonts/VoelInter-Black.otf',
          './assets/fonts/VoelInter-Light.otf',
          './assets/fonts/VoelInter-Italic.otf',
          './assets/fonts/VoelInter-Medium.otf',
          './assets/fonts/VoelInter-Regular.otf',
          './assets/fonts/VoelInter-SemiBold.otf',
          './assets/fonts/VoelInter-ExtraBold.otf',
          './assets/fonts/VoelInter-BoldItalic.otf',
          './assets/fonts/VoelInter-ExtraLight.otf',
          './assets/fonts/VoelInter-ThinItalic.otf',
          './assets/fonts/VoelInter-BlackItalic.otf',
          './assets/fonts/VoelInter-LightItalic.otf',
          './assets/fonts/VoelInter-MediumItalic.otf',
          './assets/fonts/VoelInter-SemiBoldItalic.otf',
          './assets/fonts/VoelInter-ExtraBoldItalic.otf',
          './assets/fonts/VoelInter-ExtraLightItalic.otf',
        ],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#ffffff',
        image: './assets/icons/splash-icon-dark.png',
        dark: {
          image: './assets/icons/splash-icon-light.png',
          backgroundColor: '#000000',
        },
        imageWidth: 200,
      },
    ],
    [
      'expo-build-properties',
      { android: { usesCleartextTraffic: true }, ios: { useFrameworks: 'static' } },
    ],
    ['expo-plugin-ios-static-libraries', { libraries: ['op-sqlite'] }],
    'expo-updates',
    ['./android-variants.plugin'],
    ['./op-sqlite-fixes.plugin'],
  ],
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true,
  },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier:
      process.env.RELEASE_CHANNEL === 'development'
        ? 'app.voel.ios.dev'
        : process.env.RELEASE_CHANNEL === 'preview'
          ? 'app.voel.ios.preview'
          : 'app.voel.ios',
    icon: './assets/icons/ios-icon.icon',
    infoPlist: {
      UIBackgroundModes: ['audio'],
    },
  },
  android: {
    edgeToEdgeEnabled: true,
    package:
      process.env.RELEASE_CHANNEL === 'development'
        ? 'app.voel.android.dev'
        : process.env.RELEASE_CHANNEL === 'preview'
          ? 'app.voel.android.preview'
          : 'app.voel.android',
    adaptiveIcon: {
      foregroundImage: './assets/icons/adaptive-icon.png',
      monochromeImage: './assets/icons/adaptive-icon.png',
      backgroundColor: '#000000',
    },
  },
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    enabled: process.env.CI === 'true',
    checkAutomatically: 'WIFI_ONLY',
    useEmbeddedUpdate: true,
    fallbackToCacheTimeout: 0,
    url: 'https://ota.voel.app/manifest',
    codeSigningCertificate: './certificate.pem',
    codeSigningMetadata: {
      keyid: 'main',
      alg: 'rsa-v1_5-sha256',
    },
    requestHeaders: {
      'expo-channel-name': process.env.RELEASE_CHANNEL,
    },
  },
});
