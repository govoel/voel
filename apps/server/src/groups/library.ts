import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';
import { LibraryRoot } from '@repo/spec-api/database/schema.ts';

import { Libraries } from '#src/services/libraries/index.ts';

export const LibraryHandlersLayerNoDeps = HttpApiBuilder.group(Api, 'library', (handlers) =>
  Effect.gen(function* () {
    const libraries = yield* Libraries;

    return handlers
      .handle('get', ({ params }) => libraries.get(params))
      .handle('list', ({ query }) => libraries.list(query))
      .handle('create', ({ payload }) => libraries.create(payload))
      .handle('update', ({ params, payload }) => libraries.update({ ...params, ...payload }))
      .handle('getStoragePluginSettingsForm', ({ params }) =>
        libraries.getStoragePluginSettingsForm(params)
      )
      .handle('setStoragePluginSettings', ({ params, payload }) =>
        libraries.setStoragePluginSettings({ ...params, ...payload })
      )
      .handle('setRoots', ({ params, payload }) =>
        libraries.setRoots({
          ...params,
          roots: payload.roots.map(({ root }) => LibraryRoot.fields.root.make(root)),
        })
      )
      .handle('delete', ({ params }) => libraries.delete(params));
  })
);
