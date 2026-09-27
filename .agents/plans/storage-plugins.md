# Storage plugins

## Agreed direction

- Built-ins and npm plugins share a module contract; no registration API or sandbox.
- `storagePlugin` stores a Schema-branded `StoragePluginId`: `builtin:local` or `npm:<package-name>[@<version>]` (scoped or unscoped).
- Store settings separately in `storageSettings`; the server owns database writes.
- Settings are replicated to clients. Never persist credentials, tokens, or other secrets in them; plugins must keep secrets server-side, outside the replicated database.
- Load the module's `./index` entry point. Installation and updates are app-managed. Install at library creation time, update at server boot time with a route to let admins update plugins.

## Proposed types and APIs

Proposed shared SDK exports:

```ts
import { Context, Effect, Layer, Option, Schema, SchemaIssue } from 'effect';

/** Submitted JSON; plugins still validate their own input schema. */
export const StorageSettingsInput = Schema.Json.pipe(
  Schema.brand('@repo/spec-api/storage/StorageSettingsInput')
);

/** Client-replicated, secret-free JSON; plugins validate and encode before branding. */
export const StorageSettingsPersisted = Schema.Json.pipe(
  Schema.brand('@repo/spec-api/storage/StorageSettingsPersisted')
);

/** Non-empty library storage root location, interpreted by the configured plugin. */
export const StorageRootLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@repo/spec-api/storage/StorageRootLocation')
);

/** Non-empty media file location, interpreted by the configured plugin. */
export const StorageMediaFileLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@repo/spec-api/storage/StorageMediaFileLocation')
);

/** Operational failures while using the settings editor. */
export class StorageSettingsError extends Schema.TaggedError<StorageSettingsError>()(
  'StorageSettingsError',
  { message: Schema.String }
) {}

/** Operational failures while constructing the settings editor. */
export class StorageSettingsConstructionError extends Schema.TaggedError<StorageSettingsConstructionError>()(
  'StorageSettingsConstructionError',
  { message: Schema.String }
) {}

/** Operational failures while constructing storage. */
export class StorageConstructionError extends Schema.TaggedError<StorageConstructionError>()(
  'StorageConstructionError',
  { message: Schema.String }
) {}

export class Storage extends Context.Service<
  Storage,
  {
    // Complete, idempotent decoders: validate, optionally transform, and brand.
    readonly decodeRootLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageRootLocation.Type, SchemaIssue.Issue>;

    readonly decodeMediaFileLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageMediaFileLocation.Type, SchemaIssue.Issue>;
  }
>()('@repo/spec-api/storage/Storage') {}

// Neither method writes settings. `current` is server-loaded JSON for this plugin:
// None means setup, while Some is a persisted value.
export class StorageSettingsEditor extends Context.Service<
  StorageSettingsEditor,
  {
    /** UI data, never credentials. Replace Json with a shared,
     * discriminated form schema before implementation. */
    readonly getForm: (request: {
      readonly current: Option.Option<typeof StorageSettingsPersisted.Type>;
    }) => Effect.Effect<Schema.Json, Schema.SchemaError | StorageSettingsError>;

    /** Validate the form submission using Schema and use current settings as needed
     * to produce complete, secret-free persisted JSON. Input need not match its shape.
     * The host validates JSON before saving. */
    readonly decodeFormSubmission: (request: {
      readonly current: Option.Option<typeof StorageSettingsPersisted.Type>;
      readonly input: typeof StorageSettingsInput.Type;
    }) => Effect.Effect<
      typeof StorageSettingsPersisted.Type,
      Schema.SchemaError | StorageSettingsError
    >;
  }
>()('@repo/spec-api/storage/StorageSettingsEditor') {}

export interface StoragePlugin {
  readonly storage: {
    /** Decode persisted settings with the plugin's codec, then build storage. */
    readonly layer: (request: {
      readonly settings: typeof StorageSettingsPersisted.Type;
    }) => Layer.Layer<Storage, Schema.SchemaError | StorageConstructionError>;

    /** Must build without configured storage or valid credentials. */
    readonly layerSettings: Layer.Layer<StorageSettingsEditor, StorageSettingsConstructionError>;
  };
}

// Plugin's ./index; the loader must also validate the module at runtime.
export default { storage: { layer, layerSettings } } satisfies StoragePlugin;
```

Host-owned error, excluded from plugin signatures:

```ts
/** Resolution, import, or module-contract failure; message must be client-safe. */
export class StoragePluginLoadError extends Schema.TaggedError<StoragePluginLoadError>()(
  'StoragePluginLoadError',
  { message: Schema.String }
) {}
```

## Implementation outline

1. Define SDK schemas/services and adapt local storage and callers, replacing `validateLocation` with `decodeRootLocation` / `decodeMediaFileLocation`. Remove redundant host-side decoding wrappers; service decoders return branded values ready for persistence.
2. Split plugin/settings in database and API; migrate local configuration to `builtin:local` with `{}`.
3. Implement validated module loading and make the editor available before configured storage.
4. Wire settings reads/edits through the editor and configured layer reuse through `StorageMap`.
5. Test loading, settings round-trips/persistence, location decoding, and layer reuse.

## Decisions still open

- Exact UI form/submission schema and server-only credential handling, outside replicated settings.
- Confirm the proposed JSON-only settings boundary, layer dependencies, and error contract above.
- SDK/Effect compatibility and plugin-owned settings versioning/migrations.
- Cache identity and resource lifecycle when settings change; restart-to-update is the suggested initial policy.
- Concurrent settings edits and rules for changing plugins when roots or indexed files already exist.
