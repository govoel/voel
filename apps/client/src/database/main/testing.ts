import { Layer } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { TursoSyncClientFactoryBunLayer } from '#src/database/factory/bun.ts';
import { MainDatabase } from '#src/database/main/index.ts';

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactoryBunLayer])
);
