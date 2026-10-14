import { StorageLocationValidationError } from '@govoel/plugins/storage';
import { Schema } from 'effect';

import { Library } from '#src/domains/library/schema.ts';

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/errors/LibraryNotFoundError')('LibraryNotFoundError', {
  id: Library.fields.id,
}) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/errors/LibraryNameConflictError')('LibraryNameConflictError', {
  name: Library.fields.name,
}) {}

export class LibraryUnconfiguredError extends Schema.TaggedError<
  LibraryUnconfiguredError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/errors/LibraryUnconfiguredError')('LibraryUnconfiguredError', {
  id: Library.fields.id,
}) {}

export class LibraryInvalidRootError extends Schema.TaggedError<
  LibraryInvalidRootError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/library/errors/LibraryInvalidRootError')('LibraryInvalidRootError', {
  roots: Schema.NonEmptyArray(
    Schema.Struct({
      // Rejected submissions are raw strings, not validated storage locations.
      root: Schema.String,
      message: StorageLocationValidationError.fields.message,
    })
  ),
}) {}
