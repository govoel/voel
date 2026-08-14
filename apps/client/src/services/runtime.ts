import { Layer } from 'effect';
import { Atom, Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { MainDatabase } from '#src/services/database/main';

export const AppRuntimeLayerNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps.pipe(Layer.provideMerge(Reactivity.layer)))
);

const AppRuntimeLayer = AccountManager.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(AuthClientMap.layer, MainDatabase.layer)),
  Layer.orDie
);

export const AppRuntime = Atom.runtime(
  AppRuntimeLayer.pipe(Layer.provideMerge(AtomDevToolsLayer))
).pipe(Atom.withLabel('AppRuntime'));
