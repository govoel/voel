import { withRozenite } from '@rozenite/metro';
// Learn more https://docs.expo.io/guides/customizing-metro
import { getDefaultConfig } from 'expo/metro-config.js';

/** @type {import('expo/metro-config').MetroConfig} */
// oxlint-disable-next-line typescript/no-unsafe-argument
const config = withRozenite(getDefaultConfig(import.meta.dirname), {
  // oxlint-disable-next-line node/no-process-env
  enabled: process.env.RELEASE_CHANNEL === 'dev',
  include: ['@repo/atom-devtools-plugin'],
});

export default config;
