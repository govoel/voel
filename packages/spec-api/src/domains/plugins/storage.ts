import { MediaType } from '@govoel/plugins/library';
import { Schema } from 'effect';

import { NpmPluginId } from '#src/domains/plugins/schema.ts';

/** Host-selected storage reference. Bun validates and resolves the npm suffix. */
export const StoragePluginId = Schema.Union([Schema.Literal('builtin:local'), NpmPluginId]).pipe(
  Schema.encodeTo(Schema.String),
  Schema.brand('@repo/spec-api/domains/plugins/storage/StoragePluginId')
);

/** Storage module-contract failure. Messages must be client-safe. */
export class StoragePluginLoadError extends Schema.TaggedError<
  StoragePluginLoadError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/plugins/storage/StoragePluginLoadError')('StoragePluginLoadError', {
  message: Schema.String,
}) {}

/** The storage plugin has no settings form for the library's media type. */
export class StoragePluginUnsupportedMediaTypeError extends Schema.TaggedError<
  StoragePluginUnsupportedMediaTypeError,
  { readonly brand: unique symbol }
>('@repo/spec-api/domains/plugins/storage/StoragePluginUnsupportedMediaTypeError')(
  'StoragePluginUnsupportedMediaTypeError',
  { storagePluginId: StoragePluginId, type: MediaType }
) {}
