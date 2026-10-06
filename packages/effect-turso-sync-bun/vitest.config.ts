import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tursodatabase/sync-react-native': new URL('test/native-host.ts', import.meta.url).pathname,
    },
  },
  test: {
    server: { deps: { inline: ['@repo/effect-turso-sync-rn'] } },
  },
});
