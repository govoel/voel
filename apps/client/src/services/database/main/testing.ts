import { Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { layer as tursoSyncClientLayer } from '@repo/effect-turso-sync';

import { MainDatabase } from '#src/services/database/main/index.ts';

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps(tursoSyncClientLayer).pipe(
  Layer.provide(Reactivity.layer)
);
