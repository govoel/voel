import {
  StoragePluginConstructionError,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
  StoragePluginSettingsInput,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import { Library, LibraryRoot } from '#src/database/schema.ts';
import {
  LibraryInvalidRootError,
  LibraryInvalidStoragePluginSettingsError,
  LibraryNameConflictError,
  LibraryNotFoundError,
  LibraryResponse,
  LibraryUnconfiguredError,
  StoragePluginHealth,
  StoragePluginStatus,
} from '#src/library.ts';
import { AdminMiddleware, AuthMiddleware } from '#src/middlewares/auth.ts';
import { PluginLoadError } from '#src/plugins/index.ts';
import { StoragePluginLoadError } from '#src/plugins/storage.ts';

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
      error: LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
    }),

    HttpApiEndpoint.post('create', '/api/libraries', {
      payload: Schema.Struct({
        name: Library.jsonCreate.fields.name,
        type: Library.jsonCreate.fields.type,
        storagePlugin: Library.jsonCreate.fields.storagePlugin,
      }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: LibraryNameConflictError.pipe(HttpApiSchema.status(409)),
    }),

    HttpApiEndpoint.patch('update', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({ name: Library.jsonUpdate.fields.name }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [
        LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
        LibraryNameConflictError.pipe(HttpApiSchema.status(409)),
      ],
    }),

    HttpApiEndpoint.get(
      'getStoragePluginSettingsForm',
      '/api/libraries/:id/plugins/storage/settings-form',
      {
        params: Schema.Struct({ id: Library.json.fields.id }),
        success: StoragePluginSettingsForm,
        error: [
          LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
          StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
          StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
          PluginLoadError.pipe(HttpApiSchema.status(500)),
          StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
        ],
      }
    ),

    HttpApiEndpoint.put('setStoragePluginSettings', '/api/libraries/:id/plugins/storage/settings', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({ input: StoragePluginSettingsInput }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [
        LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
        StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
        StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
        LibraryInvalidStoragePluginSettingsError.pipe(HttpApiSchema.status(422)),
        PluginLoadError.pipe(HttpApiSchema.status(500)),
        StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
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
        LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
        LibraryUnconfiguredError.pipe(HttpApiSchema.status(409)),
        LibraryInvalidRootError.pipe(HttpApiSchema.status(422)),
        StoragePluginConstructionError.pipe(HttpApiSchema.status(500)),
        PluginLoadError.pipe(HttpApiSchema.status(500)),
        StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
      ],
    }),

    HttpApiEndpoint.delete('delete', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      success: HttpApiSchema.NoContent,
    })
  )
  .middleware(AdminMiddleware)
  .middleware(AuthMiddleware);
