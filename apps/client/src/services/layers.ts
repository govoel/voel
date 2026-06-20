import { SqliteClient } from '@effect/sql-sqlite-react-native';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { DatabaseMigrationsLive } from '#src/services/database/index.ts';

export const CommonLayers = Layer.mergeAll(AccountManager.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthClientStorage.layer, DatabaseMigrationsLive)),
  Layer.provideMerge(
    AppConfig.pipe(
      Effect.map((config) => SqliteClient.layer({ filename: config.db.filename })),
      Layer.unwrap
    )
  ),
  Layer.provideMerge(Layer.mergeAll(AppConfig.layer, FetchHttpClient.layer)),
  Layer.orDie
);
