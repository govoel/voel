import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayer, LibraryHandlersLayerNoDeps } from '#src/domains/library/http.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

// The application service shares maps across acquisition, cached health, and retirement.
export const ApiRoutesLayer = HttpApiBuilder.layer(Api).pipe(Layer.provide(LibraryHandlersLayer));
