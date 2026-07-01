import { androidEmulator, androidPlatform } from '@react-native-harness/platform-android';
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple';

const config = {
  entryPoint: 'expo-router/entry',
  appRegistryComponentName: 'main',

  runners: [
    androidPlatform({
      name: 'android',
      device: androidEmulator('medium_phone'),
      bundleId: 'app.voel.rn.dev',
    }),
    applePlatform({
      name: 'ios',
      device: appleSimulator('iPhone 17 Pro', '26.5'),
      bundleId: 'app.voel.rn.dev',
    }),
  ],
  defaultRunner: 'ios',
};

export default config;
