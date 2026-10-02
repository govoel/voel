import { Schema } from 'effect';

/** Host-selected storage reference. Bun validates and resolves the npm suffix. */
export const StoragePluginId = Schema.Union([
  Schema.Literal('builtin:local'),
  Schema.TemplateLiteral(['npm:', Schema.NonEmptyString]),
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
