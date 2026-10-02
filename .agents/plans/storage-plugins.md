# Storage plugins

## Contract and lifecycle

- Built-ins and npm plugins share the `@govoel/plugins` module contract and `./index` entry point; no registration API or sandbox. Keep `@repo/spec-api` internal.
- Require a host-owned, Schema-branded `StoragePluginId` at creation: `builtin:local` or `npm:` with a nonempty suffix. Bun validates and resolves the package/version reference, including scopes, ranges, and tags. `storagePluginSettings` is nullable with no default: SQL `NULL` means unconfigured; `{}` is an explicitly validated configuration. Only the server writes to the database.
- Settings replicate to clients. Forms, submissions, and persisted settings must be secret-free; plugins read server-only credentials from plugin-defined environment variables via `ConfigProvider`.
- Build plugin layers in an explicit Effect environment containing only the declared platform services, server-only `ConfigProvider`, and intentionally preserved logging and runtime overrides (including test clocks). Do not inherit private application or database services. Layers own construction scopes; this boundary is not a security sandbox. This applies for the context supplied for layer construction and the context supplied for Effects on the layer itself.
- The app installs plugins at library creation and updates them at server boot or via an admin route.
- Forms describe UI only; plugins own semantic validation and transformations via server-side Schema decoding. No schema transport or client-side validation rules.
- Both layer factories receive SDK-owned library context with a persisted, stable ID. The host reuses its field schemas and passes only this context. Names are mutable display metadata, not storage namespaces.
- Settings edits are last-write-wins. Plugin changes retain locations, revalidating them with the new plugin before use; no silent migration.

## Installation and deployment

- Bun only, native `import()`; no Jiti or import hooks. Plugins declare compatible versions of `effect` and `@govoel/plugins` as ordinary dependencies; Bun handles dependency resolution and installation. Unversioned plugins use Bun's normal package resolution.
- Use separate plugin installs and a fresh directory per update: `bun install --linker isolated`. No manual host-package symlinks, dependency overrides, or package-identity requirement; independently installed copies must interoperate with the host.
- Before atomic activation, validate the module contract and decode every affected configured library's settings with its persisted context; skip SQL `NULL`. Failure preserves the active install; activation retires its editor/storage caches.
- The server may bundle its own dependencies; no externalization flags or shared-package runtime workspace are required for plugin identity. Keep plugin installs on the real filesystem and verify native loading from the deployed server artifact.

## Proposed types and APIs

`@govoel/plugins/library` exports `Library` (branded `id`, `type`, `name`) and `MediaType`, reused by host media items. Database variants, timestamps, and storage configuration remain host-owned.

`@govoel/plugins/storage` exports:

```ts
import type { Library } from '@govoel/plugins/library';
import { Context, Effect, Layer, Option, Schema, SchemaIssue } from 'effect';
import type { FileSystem, Path } from 'effect';
import type { HttpClient } from 'effect/unstable/http';

/** Ordered, uniquely named fields; [] means no settings. */
export const StoragePluginSettingsForm = Schema.Array(
  Schema.TaggedStruct('TextField', {
    name: Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*$/)).pipe(
      Schema.brand('@govoel/plugins/storage/StoragePluginSettingsFieldName')
    ),
    label: Schema.NonEmptyString,
    placeholder: Schema.String,
    purpose: Schema.optionalKey(Schema.Literals(['name', 'username', 'email', 'url'])),
    initialValue: Schema.String,
  })
);

/** Secret-free submitted JSON; plugins validate their input schema. */
export const StoragePluginSettingsInput = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StoragePluginSettingsInput')
);

/** Replicated, secret-free JSON; plugins validate and encode before branding. */
export const StoragePluginSettingsPersisted = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StoragePluginSettingsPersisted')
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
export class StoragePluginSettingsError extends Schema.TaggedError<StoragePluginSettingsError>()(
  'StoragePluginSettingsError',
  { message: Schema.String }
) {}

/** Operational failures constructing the settings editor. */
export class StoragePluginSettingsConstructionError extends Schema.TaggedError<StoragePluginSettingsConstructionError>()(
  'StoragePluginSettingsConstructionError',
  { message: Schema.String }
) {}

/**
 * Failures constructing storage, including invalid persisted settings.
 * Messages must be client-safe.
 */
export class StoragePluginConstructionError extends Schema.TaggedError<StoragePluginConstructionError>()(
  'StoragePluginConstructionError',
  { message: Schema.String }
) {}

export class StoragePlugin extends Context.Service<
  StoragePlugin,
  {
    // Complete, idempotent decoders: validate, optionally transform, then brand.
    readonly decodeRootLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageRootLocation.Type, SchemaIssue.Issue>;

    readonly decodeMediaFileLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<typeof StorageMediaFileLocation.Type, SchemaIssue.Issue>;
  }
>()('@govoel/plugins/storage/StoragePlugin') {}

// Neither method writes settings. `current` is server-loaded JSON for this plugin:
// None = setup; Some = persisted value.
export class StoragePluginSettings extends Context.Service<
  StoragePluginSettings,
  {
    /** UI fields and secret-free initial values; no validation rules. */
    readonly getForm: (request: {
      readonly current: Option.Option<typeof StoragePluginSettingsPersisted.Type>;
    }) => Effect.Effect<
      typeof StoragePluginSettingsForm.Type,
      Schema.SchemaError | StoragePluginSettingsError
    >;

    /** Schema-validate input, using current as needed, into complete, secret-free JSON.
     * Input and persisted shapes may differ. The host validates JSON before saving. */
    readonly decodeFormSubmission: (request: {
      readonly current: Option.Option<typeof StoragePluginSettingsPersisted.Type>;
      readonly input: typeof StoragePluginSettingsInput.Type;
    }) => Effect.Effect<
      typeof StoragePluginSettingsPersisted.Type,
      Schema.SchemaError | StoragePluginSettingsError
    >;
  }
>()('@govoel/plugins/storage/StoragePluginSettings') {}

export interface StoragePluginModule {
  readonly storage: {
    /**
     * Decode persisted settings with the plugin's codec, then build storage.
     */
    readonly layer: (request: {
      readonly library: typeof Library.Type;
      readonly settings: typeof StoragePluginSettingsPersisted.Type;
    }) => Layer.Layer<
      StoragePlugin,
      StoragePluginConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;

    /** Must build without configured storage or valid credentials. */
    readonly layerSettings: (request: {
      readonly library: typeof Library.Type;
    }) => Layer.Layer<
      StoragePluginSettings,
      StoragePluginSettingsConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;
  };
}

// Plugin's ./index; also validated by the loader at runtime.
export default { storage: { layer, layerSettings } } satisfies StoragePluginModule;
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

1. Publish SDK schemas/services, including library context; wire both factories and migrate local storage/callers from `validateLocation` to `decodeRootLocation` / `decodeMediaFileLocation`. Remove redundant host decoding wrappers: service decoders return persistence-ready branded values.
2. Require plugin selection, make settings nullable without a default, replace library upsert with create/update, and remove library/root soft deletion. Edit the initial migration; no deployed databases need upgrading.
3. Configure separate Bun-managed plugin installs and validated loading. Build plugin layers with the explicit environment above. Expose the editor before configured storage.
4. Route settings reads/edits through the editor using the lifecycle below. Key `StoragePluginSettingsMap` structurally by plugin install and full library context (`id`, `type`, `name`); `StorageMap` also includes settings. Never share layers across library IDs.
5. Test host/plugin interoperability with independently installed dependencies (services, Layers, Schema errors, configuration, cancellation, and finalization), compiled-server loading, update rejection, settings round-trips/persistence, location decoding, and layer reuse/invalidation. Cover unconfigured creation, setup retries with stable identity, name conflicts, hard-delete cascades and replica catch-up, library isolation, metadata edits, and install activation. Use installed plugin packages, not only workspace-linked copies. Verify plugin construction receives the allowed services/configuration but cannot resolve ambient private services.

## Library lifecycle

Server lifecycle implemented: create/update, persisted-library settings forms and submissions,
settings decoding outside write transactions, plugin-decoded roots, hard-delete cascades,
and post-commit cache retirement. Server tests cover setup retries, concurrent field-only
writes, deletion during settings decoding, cache reuse/isolation, and replica catch-up. There is no
library job/scanner service yet. Client integration and validated plugin install updates/atomic
activation remain pending.

- Create with required name, type, and plugin; persist settings as SQL `NULL` without resolving/installing the plugin or constructing storage. Resolve/install lazily when the settings editor or storage is needed. The committed ID stays stable through setup retries.
- Use explicit create/update commands: duplicate names conflict, missing update IDs return not-found, and neither command resurrects rows. Repeated creates return a name conflict; no creation receipts or request keys.
- Configure through the persisted library's editor (`None` for SQL `NULL`). Decode the submission and validate its persisted JSON before saving settings, including `{}` for local storage. Saving does not construct storage; construction failures surface on storage use, and the editor remains available for recovery. Failed input validation leaves prior settings unchanged; normal listings/scanning exclude unconfigured libraries. Storage-dependent operations return an unconfigured error.
- `libraryUpdate` takes only ID and name; type and plugin are fixed at creation. Renames do not load or construct plugins. Commit only the operation's fields with last-write-wins semantics, without revision checks or conflict retries. Updates to deleted IDs return not-found.
- After commit, retire superseded caches; in-flight operations may finish in existing scopes. Failed input validation leaves committed state/caches untouched. Plugin filesystem/network side effects cannot be rolled back.
- Hard-delete libraries idempotently, cascading roots and library-file mappings, retiring caches, and stopping library jobs. Preserve shared media records and physical files. Recreating the same name gets a new ID; no implicit resurrection or trash/restore.

## Settings form integration

- Fetch forms via admin RPC after creation; no pre-creation editor. Admin listings include unconfigured libraries so setup can resume. The server loads identity/current settings, never trusting client snapshots.
- `libraryGetStoragePluginSettings` takes only ID; `librarySetStoragePluginSettings` takes ID and input. Both load the library's committed metadata, plugin, and current settings on the server. Refetch forms after a committed rename; settings submissions update only settings.
- Host-validate descriptors and unique names. Names are flat keys, not TanStack paths; submissions map names to strings (`{}` for no fields).
- Use existing `useAppForm`, `TextField`, and `SubmitButton`. Derive shared client form types from the SDK descriptors; statically require exhaustive field rendering and purpose presets. Keep native props client-owned and the SDK independent of client UI libraries.
- Derive only a structural input Schema matching the declared field names and value types. Plugins remain authoritative for semantic validation and transformations on the server.
- Submit via an atom mutation to `decodeFormSubmission`. Initially report server failures through form-level `onFailure` with client-safe messages, never raw Schema errors; no inline server field errors.
