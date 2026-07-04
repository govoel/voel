import { Context, Effect, Layer, Option, Random, Redacted } from 'effect';
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
    Layer.provideMerge(Layer.mergeAll(AuthClientStorage.layerTest, AppConfig.layerTest()))
  );

type AccountManagerService = typeof AccountManager.Service;
type ActiveAccount = Option.Option.Value<Effect.Success<AccountManagerService['state']>>;
type AuthClient = ActiveAccount['state']['authClient'];

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

const makeAtomTaskScheduler = () => {
  const scheduledTasks = new Set<() => void>();

  return {
    scheduleTask: (task: () => void) => {
      let active = true;
      const scheduledTask = () => {
        if (!active) {
          return;
        }

        active = false;
        scheduledTasks.delete(scheduledTask);
        task();
      };

      scheduledTasks.add(scheduledTask);
      queueMicrotask(scheduledTask);

      return () => {
        active = false;
        scheduledTasks.delete(scheduledTask);
      };
    },
    drain: Effect.sync(() => {
      let drainCount = 0;

      while (scheduledTasks.size > 0) {
        if (drainCount > 1000) {
          throw new Error('Atom task scheduler did not settle.');
        }

        drainCount += 1;

        const tasks: (() => void)[] = [];
        for (const scheduledTask of scheduledTasks) {
          tasks.push(scheduledTask);
        }

        for (const scheduledTask of tasks) {
          scheduledTask();
        }
      }
    }),
  };
};

const makeUseSessionSubscribeSpy = Effect.fnUntraced(function* (authClient: AuthClient) {
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
    get subscribeCount() {
      return subscribeCount;
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
});

const makeTestAccountsAtoms = Effect.fnUntraced(function* () {
  const services = yield* Effect.context<AccountManager | MainDatabase>();
  const manager = Context.get(services, AccountManager);
  const runtime = Atom.runtime(Layer.succeedContext(services));
  const { activeAccountAtom, activeAccountSessionAtom } = makeAccountsAtoms(runtime);
  const atomTaskScheduler = makeAtomTaskScheduler();
  const registry = AtomRegistry.make({ scheduleTask: atomTaskScheduler.scheduleTask });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      registry.dispose();
    })
  );

  registry.mount(runtime);

  return {
    activeAccountAtom,
    activeAccountSessionAtom,
    drainAtomTasks: atomTaskScheduler.drain,
    manager,
    registry,
  };
});

it.layer(TestServerControllerClient.layer)('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'creating an account and sets it as the active account',
    Effect.fnUntraced(
      function* () {
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
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'subscribes to authClient.useSession and unsubscribes on account change',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl();
        const firstUsername = Account.fields.username.make(
          `test.admin.${Math.abs(yield* Random.nextInt)}`
        );
        const secondUsername = Account.fields.username.make(
          `test.user.${Math.abs(yield* Random.nextInt)}`
        );
        const firstClient = yield* makeAuthClient({ serverUrl, username: firstUsername });
        const secondClient = yield* makeAuthClient({ serverUrl, username: secondUsername });
        const firstClientSubscribe = yield* makeUseSessionSubscribeSpy(firstClient);
        const secondClientSubscribe = yield* makeUseSessionSubscribeSpy(secondClient);

        yield* Effect.gen(function* () {
          const { activeAccountSessionAtom, drainAtomTasks, manager, registry } =
            yield* makeTestAccountsAtoms();

          yield* manager.setActiveAccount({
            serverUrl,
            username: firstUsername,
            authClient: Option.some(firstClient),
          });

          // AccountManager subscribes once to keep Better Auth session alive
          yield* drainAtomTasks;
          expect(firstClientSubscribe.subscribeCount).toBe(1);

          // Reading the atom adds the second subscription.
          registry.mount(activeAccountSessionAtom);
          yield* drainAtomTasks;
          expect(firstClientSubscribe.subscribeCount).toBe(2);
          expect(firstClientSubscribe.unsubscribeCount).toBe(0);

          yield* manager.setActiveAccount({
            serverUrl,
            username: secondUsername,
            authClient: Option.some(secondClient),
          });

          yield* drainAtomTasks;
          expect(firstClientSubscribe.unsubscribeCount).toBe(2);
          expect(secondClientSubscribe.subscribeCount).toBe(2);
        }).pipe(Effect.provide(makeClientTestLayers()), Effect.scoped);

        expect(secondClientSubscribe.unsubscribeCount).toBe(2);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'does not resubscribe when AccountManager emits changes for the same auth client',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl();
        const { activeAccountAtom, activeAccountSessionAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const firstUsername = Account.fields.username.make(
          `test.admin.${Math.abs(yield* Random.nextInt)}`
        );
        const secondUsername = Account.fields.username.make(
          `test.user.${Math.abs(yield* Random.nextInt)}`
        );
        const client = yield* makeAuthClient({ serverUrl, username: firstUsername });
        const clientSubscribe = yield* makeUseSessionSubscribeSpy(client);

        yield* manager.setActiveAccount({
          serverUrl,
          username: firstUsername,
          authClient: Option.some(client),
        });

        // AccountManager subscribes once to keep Better Auth session alive
        yield* drainAtomTasks;
        expect(clientSubscribe.subscribeCount).toBe(1);

        // Reading the atom adds the second subscription.
        registry.mount(activeAccountSessionAtom);
        yield* drainAtomTasks;
        expect(clientSubscribe.subscribeCount).toBe(2);
        expect(clientSubscribe.unsubscribeCount).toBe(0);

        yield* manager.setActiveAccount({
          serverUrl,
          username: secondUsername,
          authClient: Option.some(client),
        });

        yield* drainAtomTasks;
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
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
