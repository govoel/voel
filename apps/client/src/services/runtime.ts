import { Layer } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';
import { make as makeReactNativeTursoSyncClient } from '@repo/effect-turso-sync-rn';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { TursoSyncClientFactory } from '#src/services/database/turso-sync-client-factory.ts';

export const AppRuntimeLayerNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps),
  Layer.provideMerge(AccountRepository.layerNoDeps)
);

const AppRuntimeLayer = AccountManager.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(AccountRepository.layer, AuthClientMap.layer)),
  Layer.provide(
    MainDatabase.layer.pipe(
      Layer.provide(TursoSyncClientFactory.layer(makeReactNativeTursoSyncClient))
    )
  ),
  Layer.orDie
);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
