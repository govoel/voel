import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayer, LibraryHandlersLayerNoDeps } from '#src/domains/library/http.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

export const ApiRoutesLayer = HttpApiBuilder.layer(Api).pipe(Layer.provide(LibraryHandlersLayer));
