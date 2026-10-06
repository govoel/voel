import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayer, LibraryHandlersLayerNoDeps } from '#src/groups/library.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

// Handlers capture the same maps for acquisition, health checks, and retirement.
export const ApiRoutesLayer = HttpApiBuilder.layer(Api).pipe(Layer.provide(LibraryHandlersLayer));
