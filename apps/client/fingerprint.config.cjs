/// <reference types="bun-types" />
// oxlint-disable-next-line import/no-nodejs-modules, typescript/no-require-imports, import/no-commonjs
const fs = require('node:fs');
// oxlint-disable-next-line import/no-nodejs-modules, typescript/no-require-imports, import/no-commonjs
const path = require('node:path');

/** @type {Readonly<Record<string, ReadonlySet<string>>>} */
const nativeExtensionsByPlatform = {
  android: new Set(['.java', '.kt', '.kts']),
  ios: new Set(['.h', '.m', '.mm', '.swift']),
};

const selectedPlatforms = process.argv.flatMap((arg, index, args) => {
  if (arg !== '--platform') {
    return [];
  }

  const platform = args[index + 1];

  return platform ? [platform] : [];
});

const platforms =
  selectedPlatforms.length > 0 ? selectedPlatforms : Object.keys(nativeExtensionsByPlatform);

const selectedExtensions = new Set(
  platforms.flatMap((platform) => [...(nativeExtensionsByPlatform[platform] ?? [])])
);

/**
 * @param {string} filePath
 */
const toPosixPath = (filePath) => filePath.split(path.sep).join('/');

/**
 * @param {string} directory
 * @returns {import('expo/fingerprint').HashSource[]}
 */
const collectNativeSources = (directory) => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectNativeSources(entryPath);
    }

    if (!entry.isFile() || !selectedExtensions.has(path.extname(entry.name))) {
      return [];
    }

    return [
      {
        type: 'file',
        filePath: toPosixPath(path.relative(__dirname, entryPath)),
        reasons: ['localNativeSource'],
      },
    ];
  });
};

// oxlint-disable-next-line import/no-commonjs
module.exports = /** @type {import('expo/fingerprint').Config} */ ({
  extraSources: collectNativeSources(path.join(__dirname, 'src')),
});
