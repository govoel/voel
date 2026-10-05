import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayerNoDeps, LibraryRepository } from '#src/groups/library.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/services/plugins/storage/index.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

// The same maps serve request acquisition and construction-time health/retirement.
// Request provision belongs here, where the group's routes are registered.
export const ApiRoutesLayer = ApiRoutesLayerNoDeps.pipe(
  HttpRouter.provideRequest(Layer.mergeAll(StoragePluginSettingsMap.layer, StoragePluginMap.layer)),
  Layer.provide([
    LibraryDatabase.layer,
    LibraryRepository.layer,
    StoragePluginSettingsMap.layer,
    StoragePluginMap.layer,
  ])
);
