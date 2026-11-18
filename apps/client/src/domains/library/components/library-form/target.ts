import { Data } from 'effect';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

export type LibraryFormTarget = Data.TaggedEnum<{
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- Create intentionally has no payload.
  Create: Record<never, never>;
  Edit: { readonly id: typeof Library.fields.id.Type };
}>;

export const LibraryFormTarget = Data.taggedEnum<LibraryFormTarget>();
