/// <reference types="bun-types" />
/* oxlint-disable typescript/no-var-requires -- Expo loads fingerprint configuration as CommonJS. */
// oxlint-disable-next-line import/no-nodejs-modules, typescript/no-require-imports, import/no-commonjs, effecttsgo/node-builtin-import
const fs = require('node:fs');
// oxlint-disable-next-line import/no-nodejs-modules, typescript/no-require-imports, import/no-commonjs, effecttsgo/node-builtin-import
const path = require('node:path');
// oxlint-disable-next-line typescript/no-require-imports, import/no-commonjs
const { Array, Record } = require('effect');

/** @type {Readonly<Record<string, ReadonlySet<string>>>} */
const nativeExtensionsByPlatform = {
  android: new Set(['.java', '.kt', '.kts']),
  ios: new Set(['.h', '.m', '.mm', '.swift']),
};

const args = process.argv;
const selectedPlatforms = Array.flatMap(args, (arg, index) => {
  if (arg !== '--platform') {
    return [];
  }

  const platform = args[index + 1];

  return platform ? [platform] : [];
});

const platforms =
  selectedPlatforms.length > 0 ? selectedPlatforms : Record.keys(nativeExtensionsByPlatform);

const selectedExtensions = new Set(
  Array.flatMap(platforms, (platform) => [...(nativeExtensionsByPlatform[platform] ?? [])])
);

/**
 * @param {string} filePath
 */
const toPosixPath = (filePath) => Array.join(filePath.split(path.sep), '/');

/**
 * @param {string} directory
 * @returns {import('expo/fingerprint').HashSource[]}
 */
const collectNativeSources = (directory) => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return Array.flatMap(fs.readdirSync(directory, { withFileTypes: true }), (entry) => {
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
  extraSources: [
    ...collectNativeSources(path.join(__dirname, 'src')),
    // The balanced preset hashes dependency versions, not patched native code.
    {
      type: 'file',
      filePath: '../../patches/@tursodatabase%2Fsync-react-native@0.8.1.patch',
      reasons: ['nativeDependencyPatch'],
    },
  ],
});
