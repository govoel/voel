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
  unmatched: {
    getFiles: z.object({ id }),
    search: z
      .object({
        asin: z.string().optional(),
        title: z.string().optional(),
        author: z.string().optional(),
      })
      .check((ctx) => {
        if (!ctx.value.asin && !ctx.value.title && !ctx.value.author) {
          ctx.issues.push({
            code: 'custom',
            message: 'At least one of ASIN or title/author must be provided',
            input: ctx.value,
          });
        }

        if ((ctx.value.asin && ctx.value.title) || (ctx.value.asin && ctx.value.author)) {
          ctx.issues.push({
            code: 'custom',
            message: 'Only one of ASIN or title and author must be provided',
            input: ctx.value,
          });
        }
      }),
    identify: z.object({
      libraryId: id,
      asin: z.string(),
      files: z.array(z.object({ parentPath: z.string(), name: z.string() })),
    }),
  },
};
