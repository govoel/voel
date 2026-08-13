import { Layer } from 'effect';
import { Atom, Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager, UuidGenerator } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const AppRuntimeLayerNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps.pipe(Layer.provideMerge(Reactivity.layer)))
);

const AppRuntimeLayer = AppRuntimeLayerNoDeps.pipe(
  Layer.provideMerge(MainDatabase.layerNoDeps),
  Layer.provide([AuthClientStorage.layer, UuidGenerator.layer, XxHash.layer, AppConfig.layer]),
  Layer.orDie
);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
