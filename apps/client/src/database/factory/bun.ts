import { Layer } from 'effect';

import { TursoSyncClient } from '@repo/effect-turso-sync-bun';

import { TursoSyncClientFactory } from '#src/database/factory/index.ts';

export const TursoSyncClientFactoryBunLayer = Layer.succeed(TursoSyncClientFactory, {
  make: TursoSyncClient.make,
});
