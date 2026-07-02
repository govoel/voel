import { reactNative } from '@srsholmes/vitest-react-native';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), reactNative()],
  resolve: {
    alias: {
      '#assets': new URL('assets', import.meta.url).pathname,
      '#src': new URL('src', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
