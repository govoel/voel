import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Voel',
  slug: 'voel',
  scheme: 'voel',
  version: '0.0.0-mvp',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/Voel-Inter-Bold.otf',
          './assets/fonts/Voel-Inter-Thin.otf',
          './assets/fonts/Voel-Inter-Black.otf',
          './assets/fonts/Voel-Inter-Light.otf',
          './assets/fonts/Voel-Inter-Italic.otf',
          './assets/fonts/Voel-Inter-Medium.otf',
          './assets/fonts/Voel-Inter-Regular.otf',
          './assets/fonts/Voel-Inter-SemiBold.otf',
          './assets/fonts/Voel-Inter-ExtraBold.otf',
          './assets/fonts/Voel-Inter-BoldItalic.otf',
          './assets/fonts/Voel-Inter-ExtraLight.otf',
          './assets/fonts/Voel-Inter-ThinItalic.otf',
          './assets/fonts/Voel-Inter-BlackItalic.otf',
          './assets/fonts/Voel-Inter-LightItalic.otf',
          './assets/fonts/Voel-Inter-MediumItalic.otf',
          './assets/fonts/Voel-Inter-SemiBoldItalic.otf',
          './assets/fonts/Voel-Inter-ExtraBoldItalic.otf',
          './assets/fonts/Voel-Inter-ExtraLightItalic.otf',
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
    ['./app.plugin'],
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
    bundleIdentifier: 'app.voel.ios',
    icon: {
      dark: './assets/icons/ios-dark.png',
      light: './assets/icons/ios-light.png',
      tinted: './assets/icons/ios-tinted.png',
    },
  },
  android: {
    package: 'app.voel.android',
    adaptiveIcon: {
      foregroundImage: './assets/icons/adaptive-icon-bigger.png',
      monochromeImage: './assets/icons/adaptive-icon-bigger.png',
      backgroundColor: '#ffffff',
    },
  },
});
