import { Layer } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const AppRuntimeLayersNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(AuthClientMap.layerNoDeps.pipe(Layer.provideMerge(Reactivity.layer)))
);

export const AppRuntimeLayers = Layer.mergeAll(
  AccountManager.layer,
  AuthClientMap.layer,
  MainDatabase.layer
).pipe(Layer.orDie);
