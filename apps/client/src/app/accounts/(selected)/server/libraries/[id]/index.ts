import { Schema } from 'effect';

import { Library } from '@repo/spec-api/domains/library/schema.ts';

export class LibraryParams extends Schema.Struct({
  id: Schema.FiniteFromString.pipe(Schema.decodeTo(Library.fields.id)),
}) {}
