const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintConfigPrettier = require('eslint-config-prettier');
const eslintPluginPrettier = require('eslint-plugin-prettier/recommended');
const reactCompiler = require('eslint-plugin-react-compiler');
const tanstackQuery = require('@tanstack/eslint-plugin-query');
const importZod = require('eslint-plugin-import-zod');
const importPlugin = require('eslint-plugin-import');

/** @type {import('eslint').Linter.Config[]} */
module.exports = defineConfig([
  expoConfig,
  eslintConfigPrettier,
  eslintPluginPrettier,
  reactCompiler.configs.recommended,
  tanstackQuery.configs['flat/recommended'],
  importPlugin.flatConfigs.recommended,
  ...importZod.configs.recommended,
  {
    ignores: ['dist/*'],
    rules: {
      // TanStack Form uses children prop
      'react/no-children-prop': 'off',

      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
