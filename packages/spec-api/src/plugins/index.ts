import { Schema } from 'effect';

/** Host-selected npm reference. Bun validates and resolves the suffix. */
export class NpmPluginId extends Schema.TemplateLiteral(['npm:', Schema.NonEmptyString]) {
  public static readonly is = Schema.is(this);
}

/** Package installation, resolution, or import failure. Messages must be client-safe. */
export class PluginLoadError extends Schema.TaggedError<
  PluginLoadError,
  { readonly brand: unique symbol }
>('@repo/spec-api/plugins/PluginLoadError')(
  'PluginLoadError',
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}
