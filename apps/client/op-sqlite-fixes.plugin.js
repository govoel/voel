/** @import { ExpoConfig } from 'expo/config'; **/
/** @import { ConfigPlugin } from 'expo/config-plugins'; **/
const withPodfileProperties = require('expo/config-plugins').withPodfileProperties;

/**
 * @param {ExpoConfig} config
 * @returns {ConfigPlugin}
 */
const withUseThirdPartySQLitePod = (config) =>
  withPodfileProperties(config, async (config) => {
    config.modResults = {
      ...config.modResults,
      'expo.updates.useThirdPartySQLitePod': 'true',
      'apple.ccacheEnabled': 'true',
    };
    return config;
  });

module.exports = withUseThirdPartySQLitePod;
