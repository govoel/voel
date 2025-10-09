module.exports = {
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  bracketSameLine: true,
  trailingComma: 'es5',

  plugins: ['@trivago/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],

  tailwindAttributes: ['className'],
  tailwindFunctions: ['cn'],

  importOrder: ['^~/components/(.*)$', '^~/lib/(.*)$', '^~/(.*)$'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderSideEffects: false,
};
