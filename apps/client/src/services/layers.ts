import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager, UuidGenerator } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const CommonGlobalLayers = AccountManager.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthClientMap.layer, FetchHttpClient.layer).pipe(
      Layer.provideMerge(Reactivity.layer)
    )
  )
);

export const CommonGlobalLayersNoDeps = AccountManager.layerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthClientMap.layer, FetchHttpClient.layer).pipe(
      Layer.provideMerge(Reactivity.layer)
    )
  )
);

export const CommonClientLayers = CommonGlobalLayers.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MainDatabase.layer,
      AuthClientStorage.layer,
      UuidGenerator.layer,
      XxHash.layer,
      AppConfig.layer
    )
  ),
  Layer.orDie
);

export const AppRuntimeLayers = CommonClientLayers.pipe(Layer.provideMerge(AtomDevToolsLayer));
