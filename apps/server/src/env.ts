import { createEnv } from '@t3-oss/env-core';
import { resolve } from 'node:path';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .transform((s) => parseInt(s, 10))
      .pipe(z.number().min(0).max(65535))
      .default('3000'),
    DATABASE_PATH: z
      .string()
      .min(1)
      .default(process.env.NODE_ENV === 'production' ? '/database/main.db' : './dev.db'),
    IMPORT_PATH: z
      .string()
      .min(1)
      .default(process.env.NODE_ENV === 'production' ? '/import' : './dev_dir/import')
      .transform((p) => resolve(p)),
    LIBRARY_PATH: z
      .string()
      .min(1)
      .default(process.env.NODE_ENV === 'production' ? '/library' : './dev_dir/library')
      .transform((p) => resolve(p)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default(process.env.NODE_ENV === 'production' ? 'error' : 'debug'),
    METADATA_EXTRACTION_BATCH_SIZE: z.coerce.number().int().positive().default(10),
    MATCHER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
