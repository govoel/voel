import { Schema } from 'effect';

/** Host-selected npm reference. Bun validates and resolves the suffix. */
export const NpmPluginId = Schema.TemplateLiteral(['npm:', Schema.NonEmptyString]);

/** Package installation, resolution, or import failure. Messages must be client-safe. */
export class PluginLoadError extends Schema.TaggedError<
  PluginLoadError,
  { readonly brand: unique symbol }
>('@repo/spec-api/plugins/PluginLoadError')('PluginLoadError', {
  message: Schema.String,
}) {}
