// Learn more https://docs.expo.io/guides/customizing-metro
import { getDefaultConfig } from 'expo/metro-config.js';

/** @type {import('expo/metro-config').MetroConfig} */
// oxlint-disable-next-line typescript/no-unsafe-argument
const config = getDefaultConfig(import.meta.dirname);

export default config;
