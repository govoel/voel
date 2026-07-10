import { Context, Effect, Layer, Option, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { expect, it } from '@repo/effect-react-native-harness';

import { makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import type { MainDatabase } from '#src/services/database/main/index.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeAuthClientWithSpy,
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
} from '#src/services/testing/utils.ts';

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

it.todo('accountsAtom reacts to account table mutations');
it.todo('accountsAtom returns persisted account rows with current active flags');

it.todo('accountsSheetAtom returns ONBOARDING and is not dismissable when there are no accounts');
it.todo(
  'accountsSheetAtom returns MUST_PICK_ACCOUNT and is not dismissable when accounts exist but none is active'
);
it.todo('accountsSheetAtom returns INVALID_SESSION and is dismissable when there is no session');
it.todo(
  'accountsSheetAtom returns INVALID_SESSION and is dismissable when the session has an error'
);
it.todo('accountsSheetAtom returns INVALID_SESSION and is dismissable when session data is null');
it.todo('accountsSheetAtom returns IDLE and is dismissable when the session is valid');

it.todo(
  'listAccountsAtom fails with ListAccountsNoAuthClientError when there is no active auth client'
);
it.todo('listAccountsAtom paginates users until the next offset reaches the total');
it.todo('listAccountsAtom stops pagination on an empty page');
it.todo('listAccountsAtom maps thrown listUsers failures to the unknown list-users error');
it.todo('listAccountsAtom maps Better Auth listUsers errors to the known list-users error');
it.todo('listAccountsAtom uses the current active account auth client after switching accounts');

it.layer(TestServerControllerClient.layer)('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'creating an account sets it as the active account',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl();
        const { activeAccountAtom, manager, registry } = yield* makeTestAccountsAtoms();

        registry.mount(activeAccountAtom);

        expect(yield* AtomRegistry.getResult(registry, activeAccountAtom)).toBe(Option.none());

        const username = yield* makeUsername();

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
    Effect.fnUntraced(function* () {
      const serverUrl = yield* makeServerUrl();
      const firstUsername = yield* makeUsername('test.admin');
      const secondUsername = yield* makeUsername();

      const firstClient = yield* makeAuthClientWithSpy({
        serverUrl,
        username: firstUsername,
      });
      const secondClient = yield* makeAuthClientWithSpy({
        serverUrl,
        username: secondUsername,
      });

      yield* Effect.gen(function* () {
        const { activeAccountSessionAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();

        yield* manager.setActiveAccount({
          serverUrl,
          username: firstUsername,
          authClient: Option.some(firstClient.authClient),
        });

        // AccountManager subscribes once to keep Better Auth session alive
        yield* drainAtomTasks;
        expect(firstClient.subscribeCount).toBe(1);

        // Reading the atom adds the second subscription.
        registry.mount(activeAccountSessionAtom);
        yield* drainAtomTasks;
        expect(firstClient.subscribeCount).toBe(2);
        expect(firstClient.unsubscribeCount).toBe(0);

        yield* manager.setActiveAccount({
          serverUrl,
          username: secondUsername,
          authClient: Option.some(secondClient.authClient),
        });

        yield* drainAtomTasks;
        expect(firstClient.unsubscribeCount).toBe(2);
        expect(secondClient.subscribeCount).toBe(2);
      }).pipe(Effect.provide(makeClientTestLayers()), Effect.scoped);

      expect(secondClient.unsubscribeCount).toBe(2);
    })
  );

  iit.effect(
    'does not resubscribe when AccountManager emits changes for the same auth client',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl();
        const { activeAccountAtom, activeAccountSessionAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const firstUsername = yield* makeUsername('test.admin');
        const secondUsername = yield* makeUsername();

        const client = yield* makeAuthClientWithSpy({
          serverUrl,
          username: firstUsername,
        });

        yield* manager.setActiveAccount({
          serverUrl,
          username: firstUsername,
          authClient: Option.some(client.authClient),
        });

        // AccountManager subscribes once to keep Better Auth session alive
        yield* drainAtomTasks;
        expect(client.subscribeCount).toBe(1);

        // Reading the atom adds the second subscription.
        registry.mount(activeAccountSessionAtom);
        yield* drainAtomTasks;
        expect(client.subscribeCount).toBe(2);
        expect(client.unsubscribeCount).toBe(0);

        yield* manager.setActiveAccount({
          serverUrl,
          username: secondUsername,
          authClient: Option.some(client.authClient),
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
        expect(client.subscribeCount).toBe(3);
        expect(client.unsubscribeCount).toBe(1);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
