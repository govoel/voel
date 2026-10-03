import {
  StorageLocationValidationError,
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Library, LibraryRoot } from '#src/database/schema.ts';
import { makeCursorPaginated } from '#src/groups/utils.ts';
import { AdminMiddleware, AuthMiddleware } from '#src/middlewares/auth.ts';
import { PluginLoadError } from '#src/plugins/index.ts';
import { StoragePluginLoadError } from '#src/plugins/storage.ts';

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNotFoundError')('LibraryNotFoundError', {
  id: Library.json.fields.id,
}) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNameConflictError')('LibraryNameConflictError', {
  name: Library.json.fields.name,
}) {}

export class LibraryUnconfiguredError extends Schema.TaggedError<
  LibraryUnconfiguredError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryUnconfiguredError')('LibraryUnconfiguredError', {
  id: Library.json.fields.id,
}) {}

export class LibraryInvalidRootError extends Schema.TaggedError<
  LibraryInvalidRootError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryInvalidRootError')('LibraryInvalidRootError', {
  roots: Schema.NonEmptyArray(
    Schema.Struct({
      root: LibraryRoot.jsonUpsert.fields.root,
      message: StorageLocationValidationError.fields.message,
    })
  ),
}) {}

class LibraryResponse extends Schema.Struct({
  id: Library.json.fields.id,
  type: Library.json.fields.type,
  name: Library.json.fields.name,
  storagePlugin: Library.json.fields.storagePlugin,
  storagePluginSettings: Library.json.fields.storagePluginSettings,
  roots: Schema.Array(
    Schema.Struct({
      id: LibraryRoot.json.fields.id,
      root: LibraryRoot.json.fields.root,
    })
  ),
}) {}

/** Cached construction state of storage and its settings editor, not a live health probe. */
const StoragePluginStatus = Schema.Literals(['unknown', 'healthy', 'unhealthy']);

/** Any cached failure wins; healthy means at least one current component was built successfully. */
export const StoragePluginHealth = Schema.Union([
  Schema.Struct({ status: Schema.Literal('unknown') }),
  Schema.Struct({ status: Schema.Literal('healthy') }),
  Schema.Struct({
    status: Schema.Literal('unhealthy'),
    errors: Schema.NonEmptyArray(
      Schema.Union([
        PluginLoadError,
        StoragePluginLoadError,
        StoragePluginConstructionError,
        StoragePluginSettingsConstructionError,
      ])
    ),
  }),
]);

export const LibraryRpcs = RpcGroup.make(
  makeCursorPaginated('libraryList', {
    cursor: Library.json.fields.id,
    success: Schema.Struct({ ...LibraryResponse.fields, storagePluginStatus: StoragePluginStatus }),
  }),

  Rpc.make('libraryGet', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Struct({ ...LibraryResponse.fields, storagePluginHealth: StoragePluginHealth }),
    error: LibraryNotFoundError,
  }),

  Rpc.make('libraryCreate', {
    payload: Schema.Struct({
      name: Library.jsonCreate.fields.name,
      type: Library.jsonCreate.fields.type,
      storagePlugin: Library.jsonCreate.fields.storagePlugin,
    }),
    success: Schema.Struct({ id: Library.json.fields.id }),
    error: LibraryNameConflictError,
  }),

  Rpc.make('libraryUpdate', {
    payload: Schema.Struct({
      id: Library.json.fields.id,
      name: Library.jsonUpdate.fields.name,
    }),
    success: Schema.Struct({ id: Library.json.fields.id }),
    error: Schema.Union([LibraryNotFoundError, LibraryNameConflictError]),
  }),

  Rpc.make('libraryGetStoragePluginSettingsForm', {
    payload: Schema.Struct({
      id: Library.json.fields.id,
    }),
    success: StoragePluginSettingsForm,
    error: Schema.Union([
      LibraryNotFoundError,
      StoragePluginSettingsConstructionError,
      StoragePluginSettingsError,
      PluginLoadError,
      StoragePluginLoadError,
    ]),
  }),

  Rpc.make('librarySetStoragePluginSettings', {
    payload: Schema.Struct({
      id: Library.json.fields.id,
      input: StoragePluginSettingsInput,
    }),
    success: Schema.Struct({ id: Library.json.fields.id }),
    error: Schema.Union([
      LibraryNotFoundError,
      StoragePluginSettingsConstructionError,
      StoragePluginSettingsError,
      PluginLoadError,
      StoragePluginLoadError,
    ]),
  }),

  Rpc.make('libraryRootsSet', {
    payload: Schema.Struct({
      id: Library.json.fields.id,
      roots: Schema.Array(Schema.Struct({ root: LibraryRoot.jsonUpsert.fields.root })),
    }),
    success: Schema.Struct({
      id: Library.json.fields.id,
      roots: Schema.Array(Schema.Struct({ root: LibraryRoot.json.fields.root })),
    }),
    error: Schema.Union([
      LibraryNotFoundError,
      LibraryUnconfiguredError,
      LibraryInvalidRootError,
      StoragePluginConstructionError,
      PluginLoadError,
      StoragePluginLoadError,
    ]),
  }),

  Rpc.make('libraryDelete', {
    payload: Schema.Struct({ id: Library.json.fields.id }),
    success: Schema.Void,
  })
)
  .middleware(AdminMiddleware)
  .middleware(AuthMiddleware);
