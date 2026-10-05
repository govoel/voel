import {
  StorageLocationValidationError,
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';

import { Library, LibraryRoot } from '#src/database/schema.ts';
import { PluginLoadError } from '#src/plugins/index.ts';
import { StoragePluginLoadError } from '#src/plugins/storage.ts';

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/library/LibraryNotFoundError')('LibraryNotFoundError', {
  id: Library.json.fields.id,
}) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/library/LibraryNameConflictError')('LibraryNameConflictError', {
  name: Library.json.fields.name,
}) {}

export class LibraryUnconfiguredError extends Schema.TaggedError<
  LibraryUnconfiguredError,
  { readonly brand: unique symbol }
>('@repo/spec-api/library/LibraryUnconfiguredError')('LibraryUnconfiguredError', {
  id: Library.json.fields.id,
}) {}

export class LibraryInvalidRootError extends Schema.TaggedError<
  LibraryInvalidRootError,
  { readonly brand: unique symbol }
>('@repo/spec-api/library/LibraryInvalidRootError')('LibraryInvalidRootError', {
  roots: Schema.NonEmptyArray(
    Schema.Struct({
      root: LibraryRoot.jsonUpsert.fields.root,
      message: StorageLocationValidationError.fields.message,
    })
  ),
}) {}

/** Submitted settings failed plugin validation; messages must be client-safe. */
export class LibraryInvalidStoragePluginSettingsError extends Schema.TaggedError<
  LibraryInvalidStoragePluginSettingsError,
  { readonly brand: unique symbol }
>('@repo/spec-api/library/LibraryInvalidStoragePluginSettingsError')(
  'LibraryInvalidStoragePluginSettingsError',
  { message: Schema.NonEmptyString }
) {}

export class LibraryResponse extends Schema.Struct({
  id: Library.json.fields.id,
  type: Library.json.fields.type,
  name: Library.json.fields.name,
  storagePlugin: Library.json.fields.storagePlugin,
  storagePluginSettings: Library.json.fields.storagePluginSettings,
  roots: Schema.Array(
    Schema.Struct({ id: LibraryRoot.json.fields.id, root: LibraryRoot.json.fields.root })
  ),
}) {}

/** Cached construction state of storage and its settings editor, not a live health probe. */
export const StoragePluginStatus = Schema.Literals(['unknown', 'healthy', 'unhealthy']);

/** Any cached failure wins; healthy means at least one current component was built successfully. */
export const StoragePluginHealth = Schema.Union([
  Schema.Struct({ status: Schema.Literal('unknown') }),
  Schema.Struct({ status: Schema.Literal('healthy') }),
  Schema.Struct({
    status: Schema.Literal('unhealthy'),
    errors: Schema.NonEmptyArray(
      Schema.Union([
        PluginLoadError,
        StoragePluginLoadError,
        StoragePluginConstructionError,
        StoragePluginSettingsConstructionError,
      ])
    ),
  }),
]);
