import { Layer } from 'effect';
import { Atom } from 'effect/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { LibraryDatabaseMap } from '#src/domains/library/database.ts';
import { TursoSyncClientFactoryReactNativeLayer } from '#src/services/database/factory/react-native.ts';

export const AppRuntimeLayerNoDeps = Layer.mergeAll(
  AccountManager.layerNoDeps,
  LibraryDatabaseMap.layerNoDeps
).pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps),
  Layer.provideMerge(AccountRepository.layerNoDeps)
);

const AppRuntimeLayer = Layer.mergeAll(
  AccountManager.layer,
  AccountRepository.layer,
  AuthClientMap.layer,
  LibraryDatabaseMap.layer
).pipe(Layer.provide(TursoSyncClientFactoryReactNativeLayer), Layer.orDie);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
