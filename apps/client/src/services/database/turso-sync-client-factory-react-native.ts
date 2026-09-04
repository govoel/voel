import { Layer } from 'effect';

import { TursoSyncClient } from '@repo/effect-turso-sync-rn';

import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

export const TursoSyncClientFactoryReactNativeLayer = Layer.succeed(TursoSyncClientFactory, {
  make: TursoSyncClient.make,
});
