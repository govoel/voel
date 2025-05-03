module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // TODO: zustand needs this, remove when fixed
          unstable_transformImportMeta: true,
        },
      ],
      'nativewind/babel',
    ],

    // plugins: [
    //   [
    //     'babel-plugin-module-resolver',
    //     {
    //       alias: {
    //         'kysely': '../../node_modules/kysely/dist/cjs/index.js'
    //       },
    //     },
    //   ],
    // ],
  };
};
