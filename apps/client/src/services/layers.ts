import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';

export const CommonGlobalLayers = Layer.mergeAll(AccountManager.layer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthClientStorage.layer, FetchHttpClient.layer, Reactivity.layer)
  )
);

export const CommonExpoLayers = Layer.mergeAll(CommonGlobalLayers).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    )
  ),
  Layer.provideMerge(Layer.mergeAll(AppConfig.layer)),
  Layer.orDie
);
