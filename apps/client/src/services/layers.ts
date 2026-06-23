import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const CommonLayers = Layer.mergeAll(AccountManager.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      ),
      AuthClientStorage.layer
    )
  ),
  Layer.provideMerge(Layer.mergeAll(AppConfig.layer, FetchHttpClient.layer, Reactivity.layer)),
  Layer.orDie
);
