import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const CommonGlobalLayers = Layer.mergeAll(
  AccountManager.layer,
  AuthClientMap.layer,
  FetchHttpClient.layer,
  Reactivity.layer
);

export const CommonGlobalLayersNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthClientMap.layerNoDeps, FetchHttpClient.layer).pipe(
      Layer.provideMerge(Reactivity.layer)
    )
  )
);

export const CommonClientLayers = Layer.mergeAll(CommonGlobalLayers, MainDatabase.layer).pipe(
  Layer.orDie
);

export const AppRuntimeLayers = CommonClientLayers.pipe(Layer.provideMerge(AtomDevToolsLayer));
