import { Migrator } from 'kysely';

import { db } from '@/libs/db';

export const migrator = new Migrator({
  db,
  provider: {
    getMigrations: async () => ({
      '1742269240381_initBetterAuth': {
        up: (await import('@/libs/db/migrations/1742269240381_initBetterAuth')).up,
        down: (await import('@/libs/db/migrations/1742269240381_initBetterAuth')).down,
      },
      '1742269532643_addLibraries': {
        up: (await import('@/libs/db/migrations/1742269532643_addLibraries')).up,
        down: (await import('@/libs/db/migrations/1742269532643_addLibraries')).down,
      },
    }),
  },
});
