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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
