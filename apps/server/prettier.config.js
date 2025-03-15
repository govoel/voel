module.exports = {
  printWidth: 100,
  tabWidth: 2,
  singleQuote: true,
  bracketSameLine: true,
  trailingComma: 'es5',

  plugins: ['@trivago/prettier-plugin-sort-imports'],

  importOrder: ['^@/routes/(.*)$', '^@/libs/(.*)$', '^@/middlewares/(.*)$', '^@/(.*)$'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderSideEffects: false,
};
