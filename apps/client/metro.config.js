// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { resolve } = require('node:path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = function packageExportsResolver(context, moduleImport, platform) {
  if (moduleImport === 'kysely') {
    return { type: 'sourceFile', filePath: resolve('../../node_modules/kysely/dist/cjs/index.js') };
  }

  // Fall back to normal resolution
  return context.resolveRequest(context, moduleImport, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
