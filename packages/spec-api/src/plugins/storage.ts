import { Schema } from 'effect';

export const NpmStoragePluginId = Schema.TemplateLiteral(['npm:', Schema.NonEmptyString]);

/** Host-selected storage reference. Bun validates and resolves the npm suffix. */
export const StoragePluginId = Schema.Union([
  Schema.Literal('builtin:local'),
  NpmStoragePluginId,
]).pipe(
  Schema.encodeTo(Schema.String),
  Schema.brand('@repo/spec-api/plugins/storage/StoragePluginId')
);

/** Host resolution, import, or module-contract failure. Messages must be client-safe. */
export class StoragePluginLoadError extends Schema.TaggedError<
  StoragePluginLoadError,
  { readonly brand: unique symbol }
>('@repo/spec-api/plugins/storage/StoragePluginLoadError')('StoragePluginLoadError', {
  message: Schema.String,
}) {}
