# Storage plugins

## Contract and lifecycle

- Built-ins and npm plugins share the `@govoel/plugins` module contract and `./index` entry point; no registration API or sandbox. Keep `@repo/spec-api` internal.
- Store a Schema-branded `StoragePluginId` in `storagePlugin`: `builtin:local` or `npm:<package-name>[@<version>]` (scoped or unscoped). Store settings separately in `storageSettings`; only the server writes to the database.
- Settings replicate to clients. Forms, submissions, and persisted settings must be secret-free; supply server-only credentials to plugin layers via `ConfigProvider`.
- The app installs plugins at library creation and updates them at server boot or via an admin route.
- Forms describe UI only; plugins own semantic validation and transformations via server-side Schema decoding. No schema transport or client-side validation rules.
- Settings edits are last-write-wins. Plugin changes retain locations, revalidating them with the new plugin before use; no silent migration.

## Installation and deployment

- Bun only, native `import()`; no Jiti or import hooks. Plugins declare `effect` and `@govoel/plugins` as `"*"` peers, never bundle them; no peer-range gate.
- Use separate plugin installs and a fresh directory per update: `bun install --linker isolated --omit=peer`. Both peers must be published because Bun resolves peer metadata; no `file:` dependencies or overrides needed.
- After each install, reconcile directory symlinks from its `node_modules/effect` and `node_modules/@govoel/plugins` to the host's canonical packages. Reject shadowing copies; verify identity across root/subpath imports and nested dependencies.
- Before atomic activation, validate the module contract and decode existing settings. On failure, keep the previous install active.
- Compile with `--external effect --external @govoel/plugins`; ship Bun, the compiled server, and shared packages on the real filesystem (not bunfs), not a self-contained executable.
- A minimal runtime workspace depends on both peers. Install using the repository lockfile: `bun install --filter @repo/server-runtime --production --frozen-lockfile --linker isolated`. Preserve workspace links and targets in the image; set its working directory for predictable resolution.

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

/** Operational failures constructing storage. */
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
export class StorageSettingsEditor extends Context.Service<
  StorageSettingsEditor,
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
>()('@govoel/plugins/storage/StorageSettingsEditor') {}

export interface StoragePlugin {
  readonly storage: {
    /** Decode persisted settings with the plugin's codec, then build storage. */
    readonly layer: (request: {
      readonly settings: typeof StorageSettingsPersisted.Type;
    }) => Layer.Layer<
      Storage,
      Schema.SchemaError | StorageConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;

    /** Must build without configured storage or valid credentials. */
    readonly layerSettings: Layer.Layer<
      StorageSettingsEditor,
      StorageSettingsConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;
  };
}

// Plugin's ./index; also validated by the loader at runtime.
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

1. Publish SDK schemas/services; migrate local storage and callers from `validateLocation` to `decodeRootLocation` / `decodeMediaFileLocation`. Remove redundant host decoding wrappers: service decoders return persistence-ready branded values.
2. Split plugin/settings in database and API; migrate local configuration to `builtin:local` with `{}`.
3. Configure external host peers/runtime workspace, isolated installs, idempotent peer linking, and validated loading. Expose the editor before configured storage.
4. Route settings reads/edits through the editor. Reuse configured layers via `StorageMap`, keyed by plugin ID and settings; invalidate after settings commits.
5. Test peer identity across isolated installs/reinstalls (root/subpaths and nested dependencies), compiled-server loading, update rejection, settings round-trips/persistence, location decoding, and layer reuse/invalidation.

## Settings form integration

- Host-validate descriptors and unique names. Names are flat keys, not TanStack paths; submissions map names to strings (`{}` for no fields).
- Use existing `useAppForm`, `TextField`, and `SubmitButton`; derive only a structural input Schema. Keep native props client-owned and purposes aligned with existing presets.
- Submit via an atom mutation to `decodeFormSubmission`. Initially report server failures through form-level `onFailure` with client-safe messages, never raw Schema errors; no inline server field errors.
