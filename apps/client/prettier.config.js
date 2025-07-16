module.exports = {
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  bracketSameLine: true,
  trailingComma: 'es5',

  plugins: [
    require.resolve('prettier-plugin-tailwindcss'),
    '@trivago/prettier-plugin-sort-imports',
  ],

  tailwindAttributes: ['className'],

  importOrder: ['^~/components/(.*)$', '^~/lib/(.*)$', '^~/(.*)$'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderSideEffects: false,
};
