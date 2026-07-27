import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { UuidGenerator, XxHash } from '#src/services/native.ts';

export const CommonGlobalLayers = CurrentAuthClient.layer.pipe(
  Layer.provideMerge(AccountManager.layer),
  Layer.provideMerge(Layer.mergeAll(FetchHttpClient.layer, Reactivity.layer))
);

export const CommonClientLayers = CommonGlobalLayers.pipe(
  Layer.provideMerge(MainDatabase.layer),
  Layer.provideMerge(
    Layer.mergeAll(AuthClientStorage.layer, UuidGenerator.layer, XxHash.layer, AppConfig.layer)
  ),
  Layer.orDie
);
