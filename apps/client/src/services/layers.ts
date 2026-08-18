import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AtomDevToolsLayer } from '@repo/effect-atom-devtools-rozenite';

import { AccountApiClientMap } from '#src/services/account-api-client.ts';
import { AccountManager, UuidGenerator } from '#src/services/accounts/index.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { AppConfig } from '#src/services/config.ts';
import { AccountDatabaseMap } from '#src/services/database/account/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { AccountSyncLive } from '#src/services/sync.ts';

const SharedGlobalLayers = Layer.mergeAll(AuthClientMap.layer, FetchHttpClient.layer).pipe(
  Layer.provideMerge(Reactivity.layer)
);

const AccountResourceLayers = Layer.mergeAll(
  AccountManager.layer,
  AccountApiClientMap.layer,
  AccountDatabaseMap.layer
).pipe(Layer.provideMerge(SharedGlobalLayers));

export const CommonGlobalLayers = AccountResourceLayers;

export const CommonClientLayers = CommonGlobalLayers.pipe(
  Layer.provideMerge(MainDatabase.layer),
  Layer.provideMerge(
    Layer.mergeAll(AuthClientStorage.layer, UuidGenerator.layer, XxHash.layer, AppConfig.layer)
  ),
  Layer.orDie
);

export const AppRuntimeLayers = AccountSyncLive.pipe(
  Layer.provideMerge(CommonClientLayers),
  Layer.provideMerge(AtomDevToolsLayer)
);
