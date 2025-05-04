module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
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
