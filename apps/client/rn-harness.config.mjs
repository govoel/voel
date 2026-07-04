import { androidEmulator, androidPlatform } from '@react-native-harness/platform-android';
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple';

const config = {
  entryPoint: 'expo-router/entry',
  appRegistryComponentName: 'main',
  bridgeTimeout: 180_000,
  bundleStartTimeout: 180_000,
  testTimeout: 120_000,
  unstable__enableMetroCache: true,

  runners: [
    androidPlatform({
      name: 'android',
      device: androidEmulator('medium_phone', {
        apiLevel: 36,
        profile: 'medium_phone',
        diskSize: '2G',
        heapSize: '1G',
        snapshot: { enabled: true },
      }),
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
