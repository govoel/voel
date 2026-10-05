import { Schema } from 'effect';

import { NpmPluginId } from '#src/plugins/index.ts';

/** Host-selected storage reference. Bun validates and resolves the npm suffix. */
export const StoragePluginId = Schema.Union([Schema.Literal('builtin:local'), NpmPluginId]).pipe(
  Schema.encodeTo(Schema.String),
  Schema.brand('@repo/spec-api/plugins/storage/StoragePluginId')
);

/** Storage module-contract failure. Messages must be client-safe. */
export class StoragePluginLoadError extends Schema.TaggedError<
  StoragePluginLoadError,
  { readonly brand: unique symbol }
>('@repo/spec-api/plugins/storage/StoragePluginLoadError')(
  'StoragePluginLoadError',
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}
