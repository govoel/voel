import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .transform((s) => parseInt(s, 10))
      .pipe(z.number().min(0).max(65535))
      .default('3000'),
    DATABASE_PATH: z.string().min(1),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default(process.env.NODE_ENV === 'production' ? 'error' : 'debug'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
