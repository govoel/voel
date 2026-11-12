import {
  StoragePluginInvalidSettingsError,
  StoragePluginSettingsConstructionError,
  StoragePluginSettingsError,
  StoragePluginSettingsForm,
} from '@govoel/plugins/storage';
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import { AdminMiddleware, AuthMiddleware } from '#src/domains/auth/http.ts';
import {
  Library,
  LibraryNameConflictError,
  LibraryNotFoundError,
  StoragePluginHealth,
  StoragePluginStatus,
} from '#src/domains/library/schema.ts';
import { PluginLoadError } from '#src/domains/plugins/schema.ts';
import { StoragePluginLoadError } from '#src/domains/plugins/storage.ts';

class LibraryResponse extends Schema.Struct({
  id: Library.json.fields.id,
  type: Library.json.fields.type,
  name: Library.json.fields.name,
  storagePluginId: Library.json.fields.storagePluginId,
  storagePluginSettings: Library.json.fields.storagePluginSettings,
}) {}

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
        storagePluginId: Library.jsonCreate.fields.storagePluginId,
        storagePluginSettings: Library.jsonCreate.fields.storagePluginSettings,
      }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [
        LibraryNameConflictError.pipe(HttpApiSchema.status(409)),
        StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
        StoragePluginInvalidSettingsError.pipe(HttpApiSchema.status(422)),
        StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
        PluginLoadError.pipe(HttpApiSchema.status(500)),
        StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
      ],
    }),

    HttpApiEndpoint.put('update', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      payload: Schema.Struct({
        name: Library.jsonUpdate.fields.name,
        type: Library.jsonUpdate.fields.type,
        storagePluginId: Library.jsonUpdate.fields.storagePluginId,
        storagePluginSettings: Library.jsonUpdate.fields.storagePluginSettings,
      }),
      success: Schema.Struct({ id: Library.json.fields.id }),
      error: [
        LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
        LibraryNameConflictError.pipe(HttpApiSchema.status(409)),
        StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
        StoragePluginInvalidSettingsError.pipe(HttpApiSchema.status(422)),
        StoragePluginSettingsError.pipe(HttpApiSchema.status(500)),
        PluginLoadError.pipe(HttpApiSchema.status(500)),
        StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
      ],
    }),

    HttpApiEndpoint.post(
      'getDraftStoragePluginSettingsForm',
      '/api/libraries/plugins/storage/settings-form',
      {
        payload: Schema.Struct({
          id: Schema.OptionFromOptionalKey(Library.json.fields.id),
          name: Library.jsonCreate.fields.name,
          type: Library.jsonCreate.fields.type,
          storagePluginId: Library.jsonCreate.fields.storagePluginId,
        }),
        success: StoragePluginSettingsForm,
        error: [
          LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
          StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
          PluginLoadError.pipe(HttpApiSchema.status(500)),
          StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
        ],
      }
    ),

    HttpApiEndpoint.get(
      'getStoragePluginSettingsForm',
      '/api/libraries/:id/plugins/storage/settings-form',
      {
        params: Schema.Struct({ id: Library.json.fields.id }),
        success: StoragePluginSettingsForm,
        error: [
          LibraryNotFoundError.pipe(HttpApiSchema.status(404)),
          StoragePluginSettingsConstructionError.pipe(HttpApiSchema.status(500)),
          PluginLoadError.pipe(HttpApiSchema.status(500)),
          StoragePluginLoadError.pipe(HttpApiSchema.status(500)),
        ],
      }
    ),

    HttpApiEndpoint.delete('delete', '/api/libraries/:id', {
      params: Schema.Struct({ id: Library.json.fields.id }),
      success: HttpApiSchema.NoContent,
    })
  )
  .middleware(AdminMiddleware)
  .middleware(AuthMiddleware);
