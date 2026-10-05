import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { Api } from '@repo/spec-api';

import { LibraryHandlersLayerNoDeps } from '#src/groups/library.ts';
import { Libraries } from '#src/services/libraries/index.ts';

export const ApiRoutesLayerNoDeps = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(LibraryHandlersLayerNoDeps)
);

export const ApiRoutesLayer = ApiRoutesLayerNoDeps.pipe(Layer.provide(Libraries.layer));
