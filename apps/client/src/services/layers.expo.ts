import { Effect, Layer } from 'effect';
import { uuid } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';
import { hash128 } from 'react-native-xxhash';

import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { OpSqliteDialect } from '#src/services/database/dialect.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';
import { UuidGenerator, XxHash } from '#src/services/native.ts';

const NativeUuidGeneratorLive = Layer.succeed(UuidGenerator, {
  v4: Effect.sync(() => uuid.v4()),
});

const NativeXxHashLive = Layer.succeed(XxHash, {
  hash128: (input) => Effect.sync(() => hash128(input)),
});

const NativeAuthClientStorageLive = Layer.effect(
  AuthClientStorage,
  AuthClientStorage.make({ getItem: SecureStore.getItem, setItem: SecureStore.setItem })
);

const NativeMainDatabaseLive = AppConfig.pipe(
  Effect.map((config) =>
    Layer.effect(
      MainDatabase,
      MainDatabase.make({ dialect: new OpSqliteDialect({ filename: config.mainDb.filename }) })
    )
  ),
  Layer.unwrap
);

export const CommonExpoLayers = CommonGlobalLayers.pipe(
  Layer.provideMerge(NativeMainDatabaseLive),
  Layer.provideMerge(
    Layer.mergeAll(
      NativeAuthClientStorageLive,
      NativeUuidGeneratorLive,
      NativeXxHashLive,
      AppConfig.layer
    )
  ),
  Layer.orDie
);
