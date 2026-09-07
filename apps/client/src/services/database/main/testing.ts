import { Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { TursoSyncClientFactoryBunLayer } from '#src/services/database/factory/bun.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactoryBunLayer])
);
