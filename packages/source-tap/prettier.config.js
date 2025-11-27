/** @type {import('prettier').Config} */
export default {
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  bracketSameLine: true,
  trailingComma: 'es5',

  plugins: ['@trivago/prettier-plugin-sort-imports'],

  importOrder: ['^./(.*)$'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderSideEffects: false,
};
