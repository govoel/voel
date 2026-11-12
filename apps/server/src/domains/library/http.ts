import { Effect, Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { AdminMiddlewareLayer, AuthMiddlewareLayer } from '#src/domains/auth/http.ts';
import { LibraryService } from '#src/domains/library/service.ts';

export const LibraryHandlersLayerNoDeps = HttpApiBuilder.group(
  Api,
  'library',
  Effect.fnUntraced(function* (handlers) {
    const service = yield* LibraryService;
    return handlers
      .handle('get', ({ params }) => service.get(params))
      .handle('list', ({ query }) => service.list(query))
      .handle('create', ({ payload }) => service.create(payload))
      .handle('update', ({ params, payload }) => service.update({ ...params, ...payload }))
      .handle('getDraftStoragePluginSettingsForm', ({ payload }) =>
        service.getDraftStoragePluginSettingsForm(payload)
      )
      .handle('getStoragePluginSettingsForm', ({ params }) =>
        service.getStoragePluginSettingsForm(params)
      )
      .handle('delete', ({ params }) => service.delete(params));
  })
);

export const LibraryHandlersLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provide([LibraryService.layer, AuthMiddlewareLayer, AdminMiddlewareLayer])
);
