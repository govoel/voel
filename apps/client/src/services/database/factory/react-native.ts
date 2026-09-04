import { Layer } from 'effect';

import { TursoSyncClient } from '@repo/effect-turso-sync-rn';

import { TursoSyncClientFactory } from '#src/services/database/factory/index.ts';

export const TursoSyncClientFactoryReactNativeLayer = Layer.succeed(TursoSyncClientFactory, {
  make: TursoSyncClient.make,
});
