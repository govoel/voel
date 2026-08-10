import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountManager, UuidGenerator } from '#src/services/accounts/index.ts';
import { AuthClientFactory, AuthClientMap, XxHash } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const CommonGlobalLayers = AccountManager.layer.pipe(
  Layer.provideMerge(AuthClientMap.layer),
  Layer.provideMerge(AuthClientFactory.layer),
  Layer.provideMerge(Layer.mergeAll(FetchHttpClient.layer, Reactivity.layer))
);

export const CommonClientLayers = CommonGlobalLayers.pipe(
  Layer.provideMerge(MainDatabase.layer),
  Layer.provideMerge(
    Layer.mergeAll(AuthClientStorage.layer, UuidGenerator.layer, XxHash.layer, AppConfig.layer)
  ),
  Layer.orDie
);

export const AppRuntimeLayers = CommonClientLayers.pipe(Layer.provideMerge(AtomDevToolsLayer));
