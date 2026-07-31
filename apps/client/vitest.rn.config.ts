import { reactNative } from '@srsholmes/vitest-react-native';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), reactNative()],
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
        inline: ['@better-auth/expo'],
      },
    },
  },
});
