import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayerNoDeps, LibraryRepository } from '#src/groups/library.ts';
import { LibraryDatabase } from '#src/services/database/library/index.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/services/plugins/storage/index.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

// Handlers capture the same maps for acquisition, health checks, and retirement.
export const ApiRoutesLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provide([
    LibraryDatabase.layer,
    LibraryRepository.layer,
    StoragePluginSettingsMap.layer,
    StoragePluginMap.layer,
  ])
);
