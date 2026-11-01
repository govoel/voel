import { Layer } from 'effect';
import { Atom } from 'effect/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { ApiClientMap } from '#src/api-client.ts';
import { TursoSyncClientFactoryReactNativeLayer } from '#src/database/factory/react-native.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { LibraryDatabaseMap } from '#src/domains/library/database.ts';

const AppRuntimeLayer = Layer.mergeAll(
  AccountManager.layer,
  AccountRepository.layer,
  AuthClientMap.layer,
  ApiClientMap.layer,
  LibraryDatabaseMap.layer
).pipe(Layer.provide(TursoSyncClientFactoryReactNativeLayer), Layer.orDie);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
