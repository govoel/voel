# Storage plugins

## Contract and lifecycle

- Built-ins and npm plugins share the `@govoel/plugins` module contract and `./index` entry point; no registration API or sandbox. Keep `@repo/spec-api` internal.
- Store a host-owned, Schema-branded `StoragePluginId` in `storagePlugin`: `builtin:local` or `npm:` with a nonempty suffix. Bun validates and resolves the package/version reference, including scopes, ranges, and tags. Store settings separately in `storageSettings`; only the server writes to the database.
- Settings replicate to clients. Forms, submissions, and persisted settings must be secret-free; plugins read server-only credentials from plugin-defined environment variables via `ConfigProvider`.
- Build plugin layers in an explicit Effect environment containing only the declared platform services, server-only `ConfigProvider`, and intentionally preserved logging and runtime overrides (including test clocks). Do not inherit private application or database services. Layers own construction scopes; this boundary is not a security sandbox. This applies for the context supplied for layer construction and the context supplied for Effects on the layer itself.
- The app installs plugins at library creation and updates them at server boot or via an admin route.
- Forms describe UI only; plugins own semantic validation and transformations via server-side Schema decoding. No schema transport or client-side validation rules.
- Settings edits are last-write-wins. Plugin changes retain locations, revalidating them with the new plugin before use; no silent migration.

## Installation and deployment

- Bun only, native `import()`; no Jiti or import hooks. Plugins declare compatible versions of `effect` and `@govoel/plugins` as ordinary dependencies; Bun handles dependency resolution and installation. Unversioned plugins use Bun's normal package resolution.
- Use separate plugin installs and a fresh directory per update: `bun install --linker isolated`. No manual host-package symlinks, dependency overrides, or package-identity requirement; independently installed copies must interoperate with the host.
- Before atomic activation, validate the module contract and decode existing settings. On failure, keep the previous install active.
- The server may bundle its own dependencies; no externalization flags or shared-package runtime workspace are required for plugin identity. Keep plugin installs on the real filesystem and verify native loading from the deployed server artifact.

## Proposed types and APIs

`@govoel/plugins` exports:

```ts
import { Context, Effect, Layer, Option, Schema, SchemaIssue } from 'effect';
import type { FileSystem, Path } from 'effect';
import type { HttpClient } from 'effect/unstable/http';

/** Ordered, uniquely named fields; [] means no settings. */
export const StorageSettingsForm = Schema.Array(
  Schema.TaggedStruct('TextField', {
    name: Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*$/)).pipe(
      Schema.brand('@govoel/plugins/storage/StorageSettingsFieldName')
    ),
    label: Schema.NonEmptyString,
    placeholder: Schema.String,
    purpose: Schema.optionalKey(Schema.Literals(['name', 'username', 'email', 'url'])),
    initialValue: Schema.String,
  })
);

/** Secret-free submitted JSON; plugins validate their input schema. */
export const StorageSettingsInput = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StorageSettingsInput')
);

/** Replicated, secret-free JSON; plugins validate and encode before branding. */
export const StorageSettingsPersisted = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StorageSettingsPersisted')
);

/** Non-empty library root, interpreted by the configured plugin. */
export const StorageRootLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageRootLocation')
);

/** Non-empty media file location, interpreted by the configured plugin. */
export const StorageMediaFileLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageMediaFileLocation')
);

/** Settings editor operational failures. */
export class StorageSettingsError extends Schema.TaggedError<StorageSettingsError>()(
  'StorageSettingsError',
  { message: Schema.String }
) {}

/** Operational failures constructing the settings editor. */
export class StorageSettingsConstructionError extends Schema.TaggedError<StorageSettingsConstructionError>()(
  'StorageSettingsConstructionError',
  { message: Schema.String }
) {}

/**
 * Failures constructing storage, including invalid persisted settings.
 * Messages must be client-safe.
 */
export class StorageConstructionError extends Schema.TaggedError<StorageConstructionError>()(
  'StorageConstructionError',
  { message: Schema.String }
) {}

export class Storage extends Context.Service<
  Storage,
  {
    // Complete, idempotent decoders: validate, optionally transform, then brand.
    readonly decodeRootLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageRootLocation.Type, SchemaIssue.Issue>;

    readonly decodeMediaFileLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageMediaFileLocation.Type, SchemaIssue.Issue>;
  }
>()('@govoel/plugins/storage/Storage') {}

// Neither method writes settings. `current` is server-loaded JSON for this plugin:
// None = setup; Some = persisted value.
export class StorageSettings extends Context.Service<
  StorageSettings,
  {
    /** UI fields and secret-free initial values; no validation rules. */
    readonly getForm: (request: {
      readonly current: Option.Option<typeof StorageSettingsPersisted.Type>;
    }) => Effect.Effect<typeof StorageSettingsForm.Type, Schema.SchemaError | StorageSettingsError>;

    /** Schema-validate input, using current as needed, into complete, secret-free JSON.
     * Input and persisted shapes may differ. The host validates JSON before saving. */
    readonly decodeFormSubmission: (request: {
      readonly current: Option.Option<typeof StorageSettingsPersisted.Type>;
      readonly input: typeof StorageSettingsInput.Type;
    }) => Effect.Effect<
      typeof StorageSettingsPersisted.Type,
      Schema.SchemaError | StorageSettingsError
    >;
  }
>()('@govoel/plugins/storage/StorageSettings') {}

export interface StoragePlugin {
  readonly storage: {
    /**
     * Decode persisted settings with the plugin's codec, then build storage.
     */
    readonly layer: (request: {
      readonly settings: typeof StorageSettingsPersisted.Type;
    }) => Layer.Layer<
      Storage,
      StorageConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;

    /** Must build without configured storage or valid credentials. */
    readonly layerSettings: Layer.Layer<
      StorageSettings,
      StorageSettingsConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;
  };
}

// Plugin's ./index; also validated by the loader at runtime.
export default { storage: { layer, layerSettings } } satisfies StoragePlugin;
```

Host-owned types in `@repo/spec-api/storage-plugin`, excluded from plugin signatures:

```ts
export const StoragePluginId = Schema.Union([
  Schema.Literal('builtin:local'),
  Schema.TemplateLiteral(['npm:', Schema.NonEmptyString]),
]).pipe(
  Schema.encodeTo(Schema.String),
  Schema.brand('@repo/spec-api/storage-plugin/StoragePluginId')
);

/** Resolution, import, or module-contract failure; message must be client-safe. */
export class StoragePluginLoadError extends Schema.TaggedError<StoragePluginLoadError>()(
  'StoragePluginLoadError',
  { message: Schema.String }
) {}
```

## Implementation outline

1. Publish SDK schemas/services; migrate local storage and callers from `validateLocation` to `decodeRootLocation` / `decodeMediaFileLocation`. Remove redundant host decoding wrappers: service decoders return persistence-ready branded values.
2. Split plugin/settings in database and API; migrate local configuration to `builtin:local` with `{}`. Edit the initial migration; no deployed databases need upgrading.
3. Configure separate Bun-managed plugin installs and validated loading. Build plugin layers with the explicit environment above. Expose the editor before configured storage.
4. Route settings reads/edits through the editor. Reuse configured layers via `StorageMap`, keyed by plugin ID and settings; invalidate after settings commits.
5. Test host/plugin interoperability with independently installed dependencies (services, Layers, Schema errors, configuration, cancellation, and finalization), compiled-server loading, update rejection, settings round-trips/persistence, location decoding, and layer reuse/invalidation. Use installed plugin packages, not only workspace-linked copies. Verify plugin construction receives the allowed services/configuration but cannot resolve ambient private services.

## Settings form integration

- The client fetches form descriptors through an admin RPC; the server loads current settings and calls the plugin's editor.
- Host-validate descriptors and unique names. Names are flat keys, not TanStack paths; submissions map names to strings (`{}` for no fields).
- Use existing `useAppForm`, `TextField`, and `SubmitButton`. Derive shared client form types from the SDK descriptors; statically require exhaustive field rendering and purpose presets. Keep native props client-owned and the SDK independent of client UI libraries.
- Derive only a structural input Schema matching the declared field names and value types. Plugins remain authoritative for semantic validation and transformations on the server.
- Submit via an atom mutation to `decodeFormSubmission`. Initially report server failures through form-level `onFailure` with client-safe messages, never raw Schema errors; no inline server field errors.
