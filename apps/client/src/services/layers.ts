import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';

export const CommonLayers = Layer.mergeAll(AccountManager.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthClientStorage.layer, DatabaseLive)),
  Layer.provideMerge(Layer.mergeAll(AppConfig.layer, FetchHttpClient.layer))
);
