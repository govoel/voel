import { Context, Deferred, Effect, Layer, Option, Random, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { expect, it, spyOn } from '@repo/effect-react-native-harness';

import { makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { AppConfig } from '#src/services/config.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { CommonGlobalLayers } from '#src/services/layers.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';

const makeClientTestLayers = () =>
  CommonGlobalLayers.pipe(
    Layer.provideMerge(
      AppConfig.pipe(
        Effect.map((config) => MainDatabase.layer({ filename: config.mainDb.filename })),
        Layer.unwrap
      )
    ),
    Layer.provideMerge(
      Layer.mergeAll(
        AuthClientStorage.layerTest,
        AppConfig.layerTest(),
        TestServerControllerClient.layer
      )
    )
  );

type AccountManagerService = typeof AccountManager.Service;
type ActiveAccount = Option.Option.Value<Effect.Success<AccountManagerService['state']>>;
type AuthClient = ActiveAccount['state']['authClient'];

interface CountWaiter {
  readonly count: number;
  readonly deferred: Deferred.Deferred<boolean>;
}

const waitForCount = (waiters: Set<CountWaiter>, getCount: () => number) => (count: number) =>
  Effect.gen(function* () {
    if (getCount() >= count) {
      return true;
    }

    const deferred = yield* Deferred.make<boolean>();
    const waiter = { count, deferred };
    waiters.add(waiter);

    if (getCount() >= count) {
      waiters.delete(waiter);
      yield* Deferred.succeed(deferred, true);
    }

    return yield* Deferred.await(deferred);
  });

const makeServerUrl = Effect.fnUntraced(function* () {
  const port = yield* Random.nextIntBetween(49_152, 65_535);
  return yield* TestServerControllerClient.use((controller) => controller.start({ port })).pipe(
    Effect.map((url) => Account.fields.serverUrl.make(url))
  );
});

const makeAuthClientStorage = (): Parameters<typeof createVoelAuthClient>[0]['storage'] => {
  const items = new Map<string, string>();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

const makeAuthClient = ({
  serverUrl,
  username,
}: Pick<ActiveAccount['account'], 'serverUrl' | 'username'>) =>
  createVoelAuthClient({ serverUrl, username, storage: makeAuthClientStorage() });

const makeUseSessionSubscribeSpy = Effect.fnUntraced(function* (authClient: AuthClient) {
  const runSyncWithServices = yield* Effect.context().pipe(Effect.map(Effect.runSyncWith));

  const originalSubscribe = authClient.useSession.subscribe.bind(authClient.useSession);
  const subscribeWaiters = new Set<CountWaiter>();
  const unsubscribeWaiters = new Set<CountWaiter>();
  let subscribeCount = 0;
  let unsubscribeCount = 0;

  const notifyWaiters = (waiters: Set<CountWaiter>, currentCount: number) => {
    for (const waiter of waiters) {
      if (currentCount >= waiter.count) {
        waiters.delete(waiter);
        runSyncWithServices(Deferred.succeed(waiter.deferred, true));
      }
    }
  };

  const subscribeSpy = spyOn(authClient.useSession, 'subscribe').mockImplementation(
    (subscriber) => {
      subscribeCount += 1;
      notifyWaiters(subscribeWaiters, subscribeCount);

      const unsubscribe = originalSubscribe(subscriber);

      return () => {
        unsubscribeCount += 1;
        notifyWaiters(unsubscribeWaiters, unsubscribeCount);

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
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
    awaitSubscribeCount: waitForCount(subscribeWaiters, () => subscribeCount),
    awaitUnsubscribeCount: waitForCount(unsubscribeWaiters, () => unsubscribeCount),
  };
});

const makeTestAccountsAtoms = Effect.fnUntraced(function* () {
  const services = yield* Effect.context<AccountManager | MainDatabase>();
  const manager = Context.get(services, AccountManager);
  const runtime = Atom.runtime(Layer.succeedContext(services));
  const { activeAccountAtom, activeAccountSessionAtom } = makeAccountsAtoms(runtime);
  const registry = AtomRegistry.make();

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      registry.dispose();
    })
  );

  registry.mount(runtime);

  return { activeAccountAtom, activeAccountSessionAtom, manager, registry };
});

const flushAtomStreams = Effect.gen(function* () {
  yield* Effect.yieldNow;
  yield* Effect.yieldNow;
});

it.layer(makeClientTestLayers())('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'creating an account and sets it as the active account',
    Effect.fnUntraced(function* () {
      const serverUrl = yield* makeServerUrl();
      const { activeAccountAtom, manager, registry } = yield* makeTestAccountsAtoms();

      registry.mount(activeAccountAtom);

      expect(yield* AtomRegistry.getResult(registry, activeAccountAtom)).toBe(Option.none());

      const username = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );

      yield* manager.setupServerWithAccount({
        serverUrl,
        name: 'Test Admin',
        email: `${username}@voel.app`,
        username,
        password: Redacted.make('ha!niceTry'),
      });

      const activeAccount = yield* AtomRegistry.getResult(registry, activeAccountAtom).pipe(
        Effect.map(Option.map(({ account }) => account))
      );

      expect(activeAccount.valueOrUndefined).toMatchObject({
        serverUrl,
        username,
        active: 1,
        // oxlint-disable-next-line typescript/no-unsafe-assignment
        createdAt: expect.any(Number),
        // oxlint-disable-next-line typescript/no-unsafe-assignment
        updatedAt: expect.any(Number),
      });
    })
  );

  iit.effect(
    'subscribes to authClient.useSession and unsubscribes on account change',
    Effect.fnUntraced(function* () {
      const serverUrl = yield* makeServerUrl();
      const { activeAccountSessionAtom, manager, registry } = yield* makeTestAccountsAtoms();
      const firstUsername = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );
      const secondUsername = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );
      const firstClient = yield* makeAuthClient({ serverUrl, username: firstUsername });
      const secondClient = yield* makeAuthClient({ serverUrl, username: secondUsername });
      const firstClientSubscribe = yield* makeUseSessionSubscribeSpy(firstClient);
      const secondClientSubscribe = yield* makeUseSessionSubscribeSpy(secondClient);

      registry.mount(activeAccountSessionAtom);

      yield* manager.setActiveAccount({
        serverUrl,
        username: firstUsername,
        authClient: Option.some(firstClient),
      });

      yield* firstClientSubscribe.awaitSubscribeCount(2);
      // AccountManager subscribes once to keep Better Auth alive; the atom adds the second subscription.
      expect(firstClientSubscribe.subscribeCount).toBe(2);
      expect(firstClientSubscribe.unsubscribeCount).toBe(0);

      yield* manager.setActiveAccount({
        serverUrl,
        username: secondUsername,
        authClient: Option.some(secondClient),
      });

      yield* firstClientSubscribe.awaitUnsubscribeCount(2);
      yield* secondClientSubscribe.awaitSubscribeCount(2);
      expect(firstClientSubscribe.unsubscribeCount).toBe(2);
      expect(secondClientSubscribe.subscribeCount).toBe(2);
    })
  );

  iit.effect(
    'does not resubscribe when AccountManager emits changes for the same auth client',
    Effect.fnUntraced(function* () {
      const serverUrl = yield* makeServerUrl();
      const { activeAccountAtom, activeAccountSessionAtom, manager, registry } =
        yield* makeTestAccountsAtoms();
      const firstUsername = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );
      const secondUsername = Account.fields.username.make(
        `test.admin.${Math.abs(yield* Random.nextInt)}`
      );
      const client = yield* makeAuthClient({ serverUrl, username: firstUsername });
      const clientSubscribe = yield* makeUseSessionSubscribeSpy(client);

      registry.mount(activeAccountAtom);
      registry.mount(activeAccountSessionAtom);

      yield* manager.setActiveAccount({
        serverUrl,
        username: firstUsername,
        authClient: Option.some(client),
      });

      yield* clientSubscribe.awaitSubscribeCount(2);
      // AccountManager subscribes once to keep Better Auth alive; the atom adds the second subscription.
      expect(clientSubscribe.subscribeCount).toBe(2);
      expect(clientSubscribe.unsubscribeCount).toBe(0);

      yield* manager.setActiveAccount({
        serverUrl,
        username: secondUsername,
        authClient: Option.some(client),
      });
      yield* flushAtomStreams;

      const activeAccount = yield* AtomRegistry.getResult(registry, activeAccountAtom).pipe(
        Effect.map(Option.map(({ account }) => account))
      );

      expect(activeAccount.valueOrUndefined).toMatchObject({
        serverUrl,
        username: secondUsername,
      });
      // The extra call is AccountManager refreshing its keepalive subscription for the new account.
      expect(clientSubscribe.subscribeCount).toBe(3);
      expect(clientSubscribe.unsubscribeCount).toBe(1);
    })
  );
});
