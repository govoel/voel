import { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';
import { TursoSyncClient } from '@repo/effect-turso-sync-rn';

import { ActiveAccountResources } from '#src/services/accounts/active-account-resources.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { TursoSyncClientFactoryReactNativeLayer } from '#src/services/database/factory/react-native.ts';
import { LibraryDatabaseMap } from '#src/services/database/library/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const AppRuntimeLayerNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps),
  Layer.provideMerge(AccountRepository.layerNoDeps)
);

const DatabaseLayers = LibraryDatabaseMap.layer(TursoSyncClient.layer).pipe(
  Layer.provideMerge(MainDatabase.layer)
);

const AppRuntimeLayer = Layer.merge(
  AccountManager.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(AccountRepository.layer, AuthClientMap.layer))
  ),
  ActiveAccountResources.layer
).pipe(
  Layer.provide(DatabaseLayers),
  Layer.provide(TursoSyncClientFactoryReactNativeLayer),
  Layer.orDie
);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
