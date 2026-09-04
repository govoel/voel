import { Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { make as makeTursoSyncClient } from '@repo/effect-turso-sync-bun';

import { MainDatabase } from '#src/services/database/main/index.ts';
import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

export const MainDatabaseTestLayer = MainDatabase.layerNoDeps.pipe(
  Layer.provide([Reactivity.layer, TursoSyncClientFactory.layer(makeTursoSyncClient)])
);
