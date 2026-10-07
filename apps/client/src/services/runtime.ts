import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Atom } from 'effect/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { ApiClientMap } from '#src/services/api-client/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { TursoSyncClientFactoryReactNativeLayer } from '#src/services/database/factory/react-native.ts';
import { LibraryDatabaseMap } from '#src/services/database/library/index.ts';

export const AppRuntimeLayerNoDeps = Layer.mergeAll(
  AccountManager.layerNoDeps,
  ApiClientMap.layerNoDeps,
  LibraryDatabaseMap.layerNoDeps
).pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps),
  Layer.provideMerge(AccountRepository.layerNoDeps),
  Layer.provideMerge(FetchHttpClient.layer)
);

const AppRuntimeLayer = Layer.mergeAll(
  AccountManager.layer,
  ApiClientMap.layer,
  AccountRepository.layer,
  AuthClientMap.layer,
  LibraryDatabaseMap.layer
).pipe(Layer.provide(TursoSyncClientFactoryReactNativeLayer), Layer.orDie);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
