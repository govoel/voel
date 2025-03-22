import { defineConfig } from 'kysely-ctl';

import { dialect } from '@/libs/db';

export default defineConfig({
  dialect,
  migrations: {
    migrationFolder: './src/libs/db/migrations',
  },
});
