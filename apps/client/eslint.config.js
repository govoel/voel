const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');
const eslintPluginPrettier = require('eslint-plugin-prettier/recommended');
const reactCompiler = require('eslint-plugin-react-compiler');
const tanstackQuery = require('@tanstack/eslint-plugin-query');
const importZod = require('eslint-plugin-import-zod');

/** @type {import('eslint').Linter.Config[]} */
module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  eslintPluginPrettier,
  reactCompiler.configs.recommended,
  tanstackQuery.configs['flat/recommended'],
  importZod.configs.recommended,
  {
    ignores: ['dist/*'],
    rules: {
      // TanStack Form uses children prop
      'react/no-children-prop': 'off',
    },
  },
]);
