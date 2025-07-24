import { createEnv } from '@t3-oss/env-core';
import { resolve } from 'node:path';
import { z } from 'zod';

export const env = createEnv({
  server: {
    // Required environment variables
    AUTH_SECRET: z.string().min(28, 'AUTH_SECRET must be at least 28 characters long'),

    // Optional environment variables
    PORT: z
      .string()
      .transform((s) => parseInt(s, 10))
      .pipe(z.number().min(0).max(65535))
      .prefault(process.env.NODE_ENV === 'production' ? '8635' : '3000'),
    DATABASE_PATH: z
      .string()
      .min(1)
      .prefault(process.env.NODE_ENV === 'production' ? '/database/main.db' : './dev.db'),
    IMPORT_PATH: z
      .string()
      .min(1)
      .prefault(process.env.NODE_ENV === 'production' ? '/import' : './dev_dir/import')
      .transform((p) => resolve(p)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .prefault(process.env.NODE_ENV === 'production' ? 'error' : 'debug'),
    METADATA_EXTRACTION_BATCH_SIZE: z.int().positive().prefault(10),
    MATCHER_BATCH_SIZE: z.int().positive().prefault(5),
  },
  runtimeEnv: {
    // Required environment variables
    AUTH_SECRET:
      process.env.NODE_ENV === 'production'
        ? process.env.AUTH_SECRET
        : 'better-auth-secret-123456789',

    // Optional environment variables
    PORT: process.env.PORT,
    DATABASE_PATH: process.env.DATABASE_PATH,
    IMPORT_PATH: process.env.IMPORT_PATH,
    LOG_LEVEL: process.env.LOG_LEVEL,
    METADATA_EXTRACTION_BATCH_SIZE: process.env.METADATA_EXTRACTION_BATCH_SIZE,
    MATCHER_BATCH_SIZE: process.env.MATCHER_BATCH_SIZE,
  },
  emptyStringAsUndefined: true,
});
