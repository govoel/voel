import { Layer } from 'effect';

import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

export const TursoSyncClientFactoryBunLayer = Layer.succeed(TursoSyncClientFactory, {
  make: TursoSyncClient.make,
});
