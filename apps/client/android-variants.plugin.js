/** @import { ExpoConfig } from 'expo/config'; **/
/** @import { ConfigPlugin } from 'expo/config-plugins'; **/
const withAppBuildGradle = require('expo/config-plugins').withAppBuildGradle;

/**
 * @param {ExpoConfig} config
 * @returns {ConfigPlugin}
 */
const withReleaseBuild = (config) =>
  withAppBuildGradle(config, async (config) => {
    config.modResults.contents =
      config.modResults.contents + "\n\napply from: '../../build.gradle'";
    return config;
  });

/** @param {ExpoConfig} config */
const withRelease = (config) => {
  return withReleaseBuild(config);
};

module.exports = withRelease;
