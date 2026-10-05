import {
  StorageLocationValidationError,
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import { Library, LibraryRoot } from '#src/database/schema.ts';
import { AdminMiddleware, AuthMiddleware } from '#src/middlewares/auth.ts';
import { PluginLoadError } from '#src/plugins/index.ts';
import { StoragePluginLoadError } from '#src/plugins/storage.ts';

export class LibraryNotFoundError extends Schema.TaggedError<
  LibraryNotFoundError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNotFoundError')(
  'LibraryNotFoundError',
  { id: Library.json.fields.id },
  { httpApiStatus: 404 }
) {}

export class LibraryNameConflictError extends Schema.TaggedError<
  LibraryNameConflictError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryNameConflictError')(
  'LibraryNameConflictError',
  { name: Library.json.fields.name },
  { httpApiStatus: 409 }
) {}

export class LibraryUnconfiguredError extends Schema.TaggedError<
  LibraryUnconfiguredError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryUnconfiguredError')(
  'LibraryUnconfiguredError',
  { id: Library.json.fields.id },
  { httpApiStatus: 409 }
) {}

export class LibraryInvalidRootError extends Schema.TaggedError<
  LibraryInvalidRootError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryInvalidRootError')(
  'LibraryInvalidRootError',
  {
    roots: Schema.NonEmptyArray(
      Schema.Struct({
        root: LibraryRoot.jsonUpsert.fields.root,
        message: StorageLocationValidationError.fields.message,
      })
    ),
  },
  { httpApiStatus: 422 }
) {}

/** Submitted settings failed plugin validation; messages must be client-safe. */
export class LibraryInvalidStoragePluginSettingsError extends Schema.TaggedError<
  LibraryInvalidStoragePluginSettingsError,
  { readonly brand: unique symbol }
>('@repo/spec-api/groups/library/LibraryInvalidStoragePluginSettingsError')(
  'LibraryInvalidStoragePluginSettingsError',
  { message: Schema.NonEmptyString },
  { httpApiStatus: 422 }
) {}

class LibraryResponse extends Schema.Struct({
  id: Library.json.fields.id,
  type: Library.json.fields.type,
  name: Library.json.fields.name,
  storagePlugin: Library.json.fields.storagePlugin,
  storagePluginSettings: Library.json.fields.storagePluginSettings,
  roots: Schema.Array(
    Schema.Struct({ id: LibraryRoot.json.fields.id, root: LibraryRoot.json.fields.root })
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

export const LibraryApi = HttpApiGroup.make('library')
  .add(
    HttpApiEndpoint.get('list', '/api/libraries', {
      query: Schema.Struct({
        cursor: Schema.OptionFromOptionalKey(Library.json.fields.id),
        limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
      }),
      success: Schema.Struct({
        items: Schema.Array(
          Schema.Struct({ ...LibraryResponse.fields, storagePluginStatus: StoragePluginStatus })
        ),
        nextCursor: Schema.Option(Library.json.fields.id),
      }),
    }),

    HttpApiEndpoint.get('get', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      success: Schema.Struct({
        ...LibraryResponse.fields,
        storagePluginHealth: StoragePluginHealth,
      }),
      error: LibraryNotFoundError,
    }),

    HttpApiEndpoint.post('create', '/api/libraries', {
      payload: Schema.Struct({
        name: Library.jsonCreate.fields.name,
        type: Library.jsonCreate.fields.type,
        storagePlugin: Library.jsonCreate.fields.storagePlugin,
      }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: LibraryNameConflictError,
    }),

    HttpApiEndpoint.patch('update', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({ name: Library.jsonUpdate.fields.name }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [LibraryNotFoundError, LibraryNameConflictError],
    }),

    HttpApiEndpoint.get(
      'getStoragePluginSettingsForm',
      '/api/libraries/:id/plugins/storage/settings-form',
      {
        params: Schema.Struct({ id: Library.json.fields.id }),
        success: StoragePluginSettingsForm,
        error: [
          LibraryNotFoundError,
          StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
          StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
          PluginLoadError,
          StoragePluginLoadError,
        ],
      }
    ),

    HttpApiEndpoint.put('setStoragePluginSettings', '/api/libraries/:id/plugins/storage/settings', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({ input: StoragePluginSettingsInput }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [
        LibraryNotFoundError,
        StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
        StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
        LibraryInvalidStoragePluginSettingsError,
        PluginLoadError,
        StoragePluginLoadError,
      ],
    }),

    HttpApiEndpoint.put('setRoots', '/api/libraries/:id/roots', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({
        roots: Schema.Array(Schema.Struct({ root: LibraryRoot.jsonUpsert.fields.root })),
      }),
      success: Schema.Struct({
        id: Library.json.fields.id,
        roots: Schema.Array(Schema.Struct({ root: LibraryRoot.json.fields.root })),
      }),
      error: [
        LibraryNotFoundError,
        LibraryUnconfiguredError,
        LibraryInvalidRootError,
        StoragePluginConstructionError.pipe(HttpApiSchema.status(500)),
        PluginLoadError,
        StoragePluginLoadError,
      ],
    }),

    HttpApiEndpoint.delete('delete', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      success: HttpApiSchema.NoContent,
    })
  )
  .middleware(AdminMiddleware)
  .middleware(AuthMiddleware);
