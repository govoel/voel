# Storage plugins

## Agreed direction

- Built-ins and npm plugins share a module contract; no registration API or sandbox.
- Publish the plugin contract as `@govoel/plugins`; keep `@repo/spec-api` internal.
- `storagePlugin` stores a Schema-branded `StoragePluginId`: `builtin:local` or `npm:<package-name>[@<version>]` (scoped or unscoped).
- Store settings separately in `storageSettings`; the server owns database writes.
- Settings are replicated to clients and are not secret-safe. Forms, submissions, and persisted settings must never contain credentials, tokens, or other secrets. Provide server-only credentials to plugin layers through `ConfigProvider`.
- Load the module's `./index` entry point. Installation and updates are app-managed. Install at library creation time, update at server boot time with a route to let admins update plugins.
- Settings forms return UI fields only. Plugins own semantic validation and transformations through server-side Schema decoding; no schema transport or client-side validation rules.
- Use separate plugin installation directories with explicit links to host peers (see below). Verify runtime identity and the module contract before activation. Reject updates that cannot decode existing settings; leave the previous install active.
- Settings edits are last-write-wins. Plugin changes are allowed: retain existing locations and revalidate them with the new plugin before use, without silently migrating them.

## Installation and deployment

- Bun only; native `import()`, no Jiti or runtime import hooks. Plugins declare `effect` and `@govoel/plugins` as `"*"` peers, never bundled copies; no peer-range gate.
- Install into a fresh directory per plugin update with `bun install --linker isolated --omit=peer`. Bun still resolves peer metadata, so both peers must be published. No `file:` dependencies or overrides needed for published peers.
- After every install, reconcile explicit directory symlinks from the installation's `node_modules/effect` and `node_modules/@govoel/plugins` to the host's canonical package directories. Reject shadowing copies; verify identity through root/subpath imports and nested dependencies before activation.
- Compile the server with `--external effect --external @govoel/plugins`; deploy those packages on the real filesystem, not bunfs. A minimal runtime workspace depends on both; install it with `bun install --filter @repo/server-runtime --production --frozen-lockfile --linker isolated` using the repository lockfile. Preserve workspace links and their targets in the image, and set its working directory for predictable resolution.
- Ship Bun for runtime plugin installation/updates. The image contains the compiled server plus shared packages, not a self-contained executable. Activate validated installs atomically; retain the previous install on failure.

## Proposed types and APIs

Proposed shared SDK exports:

```ts
import { Context, Effect, Layer, Option, Schema, SchemaIssue } from 'effect';

/** Ordered fields with unique names; an empty array represents no settings. */
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

/** Non-secret submitted JSON; plugins still validate their own input schema. */
export const StorageSettingsInput = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StorageSettingsInput')
);

/** Client-replicated, secret-free JSON; plugins validate and encode before branding. */
export const StorageSettingsPersisted = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StorageSettingsPersisted')
);

/** Non-empty library storage root location, interpreted by the configured plugin. */
export const StorageRootLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageRootLocation')
);

/** Non-empty media file location, interpreted by the configured plugin. */
export const StorageMediaFileLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageMediaFileLocation')
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
>()('@govoel/plugins/storage/Storage') {}

// Neither method writes settings. `current` is server-loaded JSON for this plugin:
// None means setup, while Some is a persisted value.
export class StorageSettingsEditor extends Context.Service<
  StorageSettingsEditor,
  {
    /** UI fields and non-secret initial values, never validation rules or credentials. */
    readonly getForm: (request: {
      readonly current: Option.Option<typeof StorageSettingsPersisted.Type>;
    }) => Effect.Effect<typeof StorageSettingsForm.Type, Schema.SchemaError | StorageSettingsError>;

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
>()('@govoel/plugins/storage/StorageSettingsEditor') {}

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

1. Publish `@govoel/plugins` with the SDK schemas/services and adapt local storage and callers, replacing `validateLocation` with `decodeRootLocation` / `decodeMediaFileLocation`. Remove redundant host-side decoding wrappers; service decoders return branded values ready for persistence.
2. Split plugin/settings in database and API; migrate local configuration to `builtin:local` with `{}`.
3. Configure external host peers and the runtime workspace; implement isolated installs, idempotent peer linking and validated module loading. Make the editor available before configured storage.
4. Wire settings reads/edits through the editor and configured layer reuse through `StorageMap`. Key by plugin ID and settings; invalidate on settings changes after commit.
5. Test peer identity across isolated installs and reinstalls (including subpaths and nested dependencies), compiled-server loading, update rejection, settings round-trips/persistence, location decoding, and layer reuse/invalidation.

## Settings form integration

- Validate descriptors and unique field names on the host. Names are flat keys, not TanStack paths; submissions are string-valued objects keyed by field name (`{}` for no fields).
- Render using the existing client `useAppForm`, `TextField`, and `SubmitButton`. Derive only a structural input Schema from the fields; keep native props client-owned and input purposes aligned with the existing presets.
- Submit through an atom mutation to `decodeFormSubmission`. Initially show server failures through the existing form-level `onFailure` path, using client-safe messages; never forward raw Schema errors. No inline server field errors initially.
