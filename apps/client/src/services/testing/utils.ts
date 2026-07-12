import { Effect, Layer, Random } from 'effect';
import type { Option } from 'effect';

import { spyOn } from '@repo/effect-react-native-harness';

import type { AccountManager } from '#src/services/accounts/index.ts';
import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';

export const makeClientTestLayers = () =>
  CommonGlobalLayers.pipe(
    Layer.provideMerge(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    ),
    Layer.provideMerge(Layer.mergeAll(AuthClientStorage.layerTest, AppConfig.layerTest()))
  );

export const makeServerUrl = Effect.fnUntraced(function* () {
  const port = yield* Random.nextIntBetween(49_152, 65_535);
  return yield* TestServerControllerClient.use((controller) => controller.start({ port })).pipe(
    Effect.map((url) => Account.fields.serverUrl.make(url))
  );
});

export const makeAuthClientStorage = (): Parameters<typeof createVoelAuthClient>[0]['storage'] => {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

export const makeUsername = (prefix = 'test.user') =>
  Random.nextInt.pipe(
    Effect.map((suffix) => Account.fields.username.make(`${prefix}.${Math.abs(suffix)}`))
  );

export const makeAuthClient = ({
  serverUrl,
  username,
}: Pick<
  Option.Option.Value<Effect.Success<(typeof AccountManager.Service)['state']>>['account'],
  'serverUrl' | 'username'
>) => createVoelAuthClient({ serverUrl, username, storage: makeAuthClientStorage() });

export const makeAuthClientWithSpy = Effect.fnUntraced(function* ({
  serverUrl,
  username,
}: Parameters<typeof makeAuthClient>[0]) {
  const authClient = yield* makeAuthClient({ serverUrl, username });
  const originalSubscribe = authClient.useSession.subscribe.bind(authClient.useSession);
  let subscribeCount = 0;
  let unsubscribeCount = 0;

  const subscribeSpy = spyOn(authClient.useSession, 'subscribe').mockImplementation(
    (subscriber) => {
      subscribeCount += 1;

      const unsubscribe = originalSubscribe(subscriber);

      return () => {
        unsubscribeCount += 1;

        unsubscribe();
      };
    }
  );

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      subscribeSpy.mockRestore();
    })
  );

  return {
    authClient,
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
});
