import { Array, Context, Schema } from 'effect';
import type { Effect, FileSystem, Layer, Option, Path, SchemaIssue } from 'effect';
import type { HttpClient } from 'effect/unstable/http';

import type { Library } from '#src/library.ts';

/**
 * Ordered UI fields with unique, flat names. An empty array means no settings.
 * Descriptors carry no semantic validation rules and must contain no secrets.
 */
export const StoragePluginSettingsForm = Schema.Array(
  Schema.TaggedStruct('TextField', {
    name: Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*$/u)).pipe(
      Schema.brand('@govoel/plugins/storage/StoragePluginSettingsFieldName')
    ),
    label: Schema.NonEmptyString,
    placeholder: Schema.String,
    purpose: Schema.optionalKey(Schema.Literals(['name', 'username', 'email', 'url'])),
    initialValue: Schema.String,
  })
).check(
  Schema.makeFilter(
    (fields) => Array.dedupe(fields.map(({ name }) => name)).length === fields.length,
    { message: 'Settings field names must be unique' }
  )
);
export type StoragePluginSettingsForm = typeof StoragePluginSettingsForm.Type;

/**
 * Secret-free submitted JSON; plugins validate their input schema.
 * This brand checks JSON structure, not whether values contain secrets.
 */
export const StoragePluginSettingsInput = Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StoragePluginSettingsInput')
);
export type StoragePluginSettingsInput = typeof StoragePluginSettingsInput.Type;

/**
 * Replicated, secret-free JSON; plugins validate and encode before branding.
 * This brand checks JSON structure, not whether values contain secrets.
 */
export class StoragePluginSettingsPersisted extends Schema.Json.pipe(
  Schema.brand('@govoel/plugins/storage/StoragePluginSettingsPersisted')
) {
  public static readonly fromJsonString = Schema.fromJsonString(this);
}

/**
 * Non-empty library root, interpreted by the configured plugin.
 */
export const StorageRootLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageRootLocation')
);
export type StorageRootLocation = typeof StorageRootLocation.Type;

/**
 * Non-empty media file location, interpreted by the configured plugin.
 */
export const StorageMediaFileLocation = Schema.NonEmptyString.pipe(
  Schema.brand('@govoel/plugins/storage/StorageMediaFileLocation')
);
export type StorageMediaFileLocation = typeof StorageMediaFileLocation.Type;

/**
 * Settings editor operational failure. Messages must be client-safe.
 */
export class StoragePluginSettingsError extends Schema.TaggedError<
  StoragePluginSettingsError,
  { readonly brand: unique symbol }
>('@govoel/plugins/storage/StoragePluginSettingsError')('StoragePluginSettingsError', {
  message: Schema.String,
}) {}

/**
 * Operational failure constructing the settings editor. Messages must be client-safe.
 */
export class StoragePluginSettingsConstructionError extends Schema.TaggedError<
  StoragePluginSettingsConstructionError,
  { readonly brand: unique symbol }
>('@govoel/plugins/storage/StoragePluginSettingsConstructionError')(
  'StoragePluginSettingsConstructionError',
  {
    message: Schema.String,
  }
) {}

/**
 * Failure constructing storage, including invalid persisted settings.
 * Messages must be client-safe.
 */
export class StoragePluginConstructionError extends Schema.TaggedError<
  StoragePluginConstructionError,
  { readonly brand: unique symbol }
>('@govoel/plugins/storage/StoragePluginConstructionError')('StoragePluginConstructionError', {
  message: Schema.String,
}) {}

export class StoragePlugin extends Context.Service<
  StoragePlugin,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- plugins implement this contract
  {
    /**
     * Complete, idempotent decoder: validate, optionally transform, then brand.
     */
    readonly decodeRootLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<StorageRootLocation, SchemaIssue.Issue>;

    /**
     * Complete, idempotent decoder: validate, optionally transform, then brand.
     */
    readonly decodeMediaFileLocation: (request: {
      readonly location: string;
    }) => Effect.Effect<StorageMediaFileLocation, SchemaIssue.Issue>;
  }
>()('@govoel/plugins/storage/StoragePlugin') {}

/**
 * Neither method writes settings. `current` is server-loaded JSON for this plugin:
 * None means setup; Some means a persisted value (which must be decoded by the plugin).
 */
export class StoragePluginSettings extends Context.Service<
  StoragePluginSettings,
  // oxlint-disable-next-line effect-conventions/no-context-service-second-type-argument -- plugins implement this contract
  {
    /**
     * UI fields and secret-free initial values; no validation rules.
     */
    readonly getForm: (request: {
      readonly current: Option.Option<StoragePluginSettingsPersisted>;
    }) => Effect.Effect<StoragePluginSettingsForm, Schema.SchemaError | StoragePluginSettingsError>;

    /**
     * Schema-validate input, using current as needed, into complete, secret-free JSON.
     * Input and persisted shapes may differ. The host validates JSON before saving.
     */
    readonly decodeFormSubmission: (request: {
      readonly current: Option.Option<StoragePluginSettingsPersisted>;
      readonly input: StoragePluginSettingsInput;
    }) => Effect.Effect<
      StoragePluginSettingsPersisted,
      Schema.SchemaError | StoragePluginSettingsError
    >;
  }
>()('@govoel/plugins/storage/StoragePluginSettings') {}

/**
 * Default export of a plugin's ./index module. Credentials are server-only ConfigProvider
 * values, never form fields or persisted settings. The host supplies platform services.
 */
export interface StoragePluginModule {
  readonly storage: {
    /**
     * Decode persisted settings with the plugin's codec, then build storage.
     */
    readonly layer: (request: {
      readonly library: typeof Library.Type;
      readonly settings: StoragePluginSettingsPersisted;
    }) => Layer.Layer<
      StoragePlugin,
      StoragePluginConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;

    /**
     * Only built for persisted libraries; must not require configured storage or valid credentials.
     */
    readonly layerSettings: (request: {
      readonly library: typeof Library.Type;
    }) => Layer.Layer<
      StoragePluginSettings,
      StoragePluginSettingsConstructionError,
      FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
    >;
  };
}
