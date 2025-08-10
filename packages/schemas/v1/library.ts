import * as z from 'zod';

const id = z.coerce.number<number>().int().positive('Library ID must be a positive integer');

const name = z
  .string()
  .min(1, 'Library name is required')
  .max(64, 'Library name must be less than 64 characters')
  .trim();

const path = z.string().min(1, 'Absolute library path is required').trim();

export const library = {
  create: z.object({ name, path }),
  scan: z.object({ id }),
};
