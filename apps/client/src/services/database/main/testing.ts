import { Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { MainDatabase } from '#src/services/database/main/index.ts';
import { TursoSyncClientFactoryBunLayer } from '#src/services/database/turso-sync-client-factory-bun.ts';

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactoryBunLayer])
);
