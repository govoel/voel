import { Array, Effect, Layer, Option, Predicate, Random, Redacted } from 'effect';
import type { Types } from 'effect';

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

type TestAccount = Option.Option.Value<
  Effect.Success<(typeof AccountManager.Service)['state']>
>['account'];

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

interface TestServer<UserCount extends number> {
  readonly adminUsername: TestAccount['username'];
  readonly password: Redacted.Redacted;
  readonly serverUrl: TestAccount['serverUrl'];
  readonly userCount: UserCount;
  readonly usernames: Types.TupleOf<UserCount, TestAccount['username']>;
}

export const setupTestServerWithUsers = Effect.fnUntraced(function* <
  const UserCount extends number,
>({ userCount }: { readonly userCount: UserCount }) {
  const serverUrl = yield* makeServerUrl();
  const password = Redacted.make('ha!niceTry');
  const usernames = yield* Effect.forEach(
    Array.makeBy(userCount, (index) => index),
    (index) => makeUsername(index === 0 ? 'test.admin' : `test.user.${index}`)
  );
  const adminUsername = Array.headNonEmpty(usernames);
  const adminAuthClient = yield* makeAuthClient({ serverUrl, username: adminUsername });

  const signUpResult = yield* Effect.promise(async () =>
    adminAuthClient.signUp.email({
      name: 'Test Admin',
      email: `${adminUsername}@voel.app`,
      username: adminUsername,
      password: Redacted.value(password),
    })
  );
  if (signUpResult.error !== null) {
    return yield* Effect.die(new Error(signUpResult.error.message ?? 'Failed to create admin'));
  }

  yield* Effect.forEach(
    Array.tailNonEmpty(usernames),
    Effect.fnUntraced(function* (username, index) {
      const createUserResult = yield* Effect.promise(async () =>
        adminAuthClient.admin.createUser({
          name: `Test User ${index + 1}`,
          email: `${username}@voel.app`,
          password: Redacted.value(password),
          role: 'user',
          data: { username },
        })
      );
      if (createUserResult.error !== null) {
        return yield* Effect.die(
          new Error(createUserResult.error.message ?? 'Failed to create user')
        );
      }
      return void 0;
    }),
    { discard: true, concurrency: 'unbounded' }
  );

  if (!Predicate.isTupleOf(usernames, userCount)) {
    return yield* Effect.die(new Error('Created an unexpected number of test users'));
  }

  return {
    adminUsername,
    password,
    serverUrl,
    userCount,
    usernames,
  } satisfies TestServer<UserCount>;
});

export const signInTestServerUsers = Effect.fnUntraced(function* <const UserCount extends number>(
  manager: AccountManager['Service'],
  { password, serverUrl, userCount, usernames }: TestServer<UserCount>
) {
  const accounts = yield* Effect.forEach(
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- seems like a false positive
    usernames,
    Effect.fnUntraced(function* (username) {
      yield* manager.signInAccount({ serverUrl, username, password });
      return Option.getOrThrow(yield* manager.state).account;
    })
  );

  if (!Predicate.isTupleOf(accounts, userCount)) {
    return yield* Effect.die(new Error('Signed in an unexpected number of test users'));
  }

  return accounts;
});

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
