import { reactNative } from '@srsholmes/vitest-react-native';
import react from '@vitejs/plugin-react';
import { String } from 'effect';
import commonjs from 'vite-plugin-commonjs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Expo ships CommonJS. Convert its requires so navigation hooks can be mocked
    // while exercising the real Redirect and focus lifecycle.
    commonjs({
      filter: String.includes('/expo-router/build/'),
      advanced: { importRules: 'namedFirst' },
    }),
    react(),
    reactNative(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: 'node',
    hookTimeout: 120_000,
    testTimeout: 120_000,
    server: {
      deps: {
        inline: ['@better-auth/expo', 'expo-router'],
      },
    },
  },
});
