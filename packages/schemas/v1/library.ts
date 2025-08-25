import * as z from 'zod';

/**
 * Validation schema for library ID values.
 * Ensures IDs are positive integers, with coercion from strings.
 */
const id = z.coerce.number<number>().int().positive('Library ID must be a positive integer');

/**
 * Validation schema for library names.
 * Names must be 1-64 characters and are automatically trimmed.
 */
const name = z
  .string()
  .min(1, 'Library name is required')
  .max(64, 'Library name must be less than 64 characters')
  .trim();

/**
 * Validation schema for library paths.
 * Must be non-empty absolute paths, automatically trimmed.
 */
const path = z.string().min(1, 'Absolute library path is required').trim();

/**
 * Library-related validation schemas for API requests and responses.
 *
 * Covers library management operations including creation, scanning,
 * and handling of unmatched audiobook files.
 */
export const library = {
  /**
   * Schema for creating a new library.
   * Requires a name and absolute path to the library directory.
   */
  create: z.object({ name, path }),

  /**
   * Schema for scanning an existing library.
   * Requires the library ID to identify which library to scan.
   */
  scan: z.object({ id }),

  /**
   * Schemas related to unmatched audiobook files within libraries.
   */
  unmatched: {
    /**
     * Schema for retrieving unmatched files from a specific library.
     */
    getFiles: z.object({ id }),

    /**
     * Schema for searching audiobook metadata by ASIN or title/author.
     *
     * Validates that either ASIN is provided OR both title and author,
     * but not both ASIN and title/author simultaneously.
     *
     * @example
     * ```typescript
     * // Valid: ASIN search
     * { asin: "B001234567" }
     *
     * // Valid: Title/author search
     * { title: "The Great Gatsby", author: "F. Scott Fitzgerald" }
     *
     * // Invalid: Both ASIN and title
     * { asin: "B001234567", title: "Some Title" }
     * ```
     */
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

    /**
     * Schema for identifying unmatched files with specific audiobook metadata.
     * Links files to an audiobook ASIN after manual identification.
     */
    identify: z.object({
      libraryId: id,
      asin: z.string(),
      files: z.array(z.object({ parentPath: z.string(), name: z.string() })),
    }),
  },
};
