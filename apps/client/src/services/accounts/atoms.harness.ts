import { Context, Deferred, Effect, Layer, Option, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { describe, expect, it, spyOn } from '@repo/effect-react-native-harness';

import { ListAccountsNoAuthClientError, makeAccountsAtoms } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeAuthClient,
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
  const {
    accountsAtom,
    accountsSheetAtom,
    activeAccountAtom,
    activeAccountSessionAtom,
    listAccountsAtom,
  } = makeAccountsAtoms(runtime);
  const atomTaskScheduler = makeAtomTaskScheduler();
  const registry = AtomRegistry.make({ scheduleTask: atomTaskScheduler.scheduleTask });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      registry.dispose();
    })
  );

  registry.mount(runtime);

  return {
    accountsAtom,
    accountsSheetAtom,
    activeAccountAtom,
    activeAccountSessionAtom,
    drainAtomTasks: atomTaskScheduler.drain,
    listAccountsAtom,
    manager,
    registry,
  };
});

type AuthClient = Effect.Success<ReturnType<typeof makeAuthClient>>;

const waitForSessionRequest = (authClient: AuthClient) => {
  const initialSession = authClient.useSession.get();
  if (!initialSession.isPending && !initialSession.isRefetching) {
    return Effect.void;
  }

  return Effect.callback((resume) => {
    let completed = false;

    const unsubscribe = authClient.useSession.subscribe(({ isPending, isRefetching }) => {
      if (completed || isPending || isRefetching) {
        return;
      }

      completed = true;
      unsubscribe();
      resume(Effect.void);
    });

    return Effect.sync(() => {
      unsubscribe();
    });
  });
};

it.effect(
  'accountsAtom reacts to account table mutations',
  Effect.fnUntraced(
    function* () {
      const { accountsAtom, drainAtomTasks, manager, registry } = yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://atoms.example.test');
      const username = Account.fields.username.make('reactive');

      expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toEqual([]);

      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.none(),
      });

      yield* drainAtomTasks;
      expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toMatchObject([
        { serverUrl, username, active: 1 },
      ]);

      yield* manager.removeAccount({ serverUrl, username });

      yield* drainAtomTasks;
      expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toEqual([]);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'accountsAtom returns persisted account rows with current active flags',
  Effect.fnUntraced(
    function* () {
      const { accountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://persisted-atoms.example.test');
      const firstUsername = Account.fields.username.make('first');
      const secondUsername = Account.fields.username.make('second');

      yield* manager.setActiveAccount({
        serverUrl,
        username: firstUsername,
        authClient: Option.none(),
      });
      yield* manager.setActiveAccount({
        serverUrl,
        username: secondUsername,
        authClient: Option.none(),
      });

      expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toMatchObject([
        { serverUrl, username: firstUsername, active: 0 },
        { serverUrl, username: secondUsername, active: 1 },
      ]);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'accountsSheetAtom returns ONBOARDING and is not dismissable when there are no accounts',
  Effect.fnUntraced(
    function* () {
      const { accountsSheetAtom, registry } = yield* makeTestAccountsAtoms();

      expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
        mode: 'ONBOARDING',
        dismissable: false,
      });
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'accountsSheetAtom returns MUST_PICK_ACCOUNT and is not dismissable when accounts exist but none are active',
  Effect.fnUntraced(
    function* () {
      const db = yield* MainDatabase;
      const { accountsSheetAtom, registry } = yield* makeTestAccountsAtoms();

      yield* db.execute(
        db.insertInto('account').values({
          serverUrl: Account.fields.serverUrl.make('http://pick-account.example.test'),
          username: Account.fields.username.make('inactive'),
          active: Account.fields.active.make(0),
        })
      );

      expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
        mode: 'MUST_PICK_ACCOUNT',
        dismissable: false,
      });
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

describe('accountsSheetAtom pending and failed sessions', () => {
  it.effect(
    'returns IDLE and is dismissable while the session is pending',
    Effect.fnUntraced(
      function* () {
        const { accountsSheetAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const serverUrl = Account.fields.serverUrl.make('http://pending-session.example.test');
        const username = Account.fields.username.make('pending-session');
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          if (new URL(requestUrl).pathname !== '/api/auth/get-session') {
            throw new Error(`Unexpected request: ${requestUrl}`);
          }

          return Effect.runPromise(Effect.never);
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            fetchSpy.mockRestore();
          })
        );
        const authClient = yield* makeAuthClient({ serverUrl, username });

        yield* manager.setActiveAccount({
          serverUrl,
          username,
          authClient: Option.some(authClient),
        });

        expect(authClient.useSession.get()).toMatchObject({
          data: null,
          error: null,
          isPending: true,
        });
        yield* drainAtomTasks;
        expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
          mode: 'IDLE',
          dismissable: true,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  it.effect(
    'returns IDLE and is dismissable when the session request fails',
    Effect.fnUntraced(
      function* () {
        const { accountsSheetAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const serverUrl = Account.fields.serverUrl.make('http://failed-session.example.test');
        const username = Account.fields.username.make('failed-session');
        const getSessionResponse = yield* Deferred.make<Response, Error>();
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          if (new URL(requestUrl).pathname !== '/api/auth/get-session') {
            throw new Error(`Unexpected request: ${requestUrl}`);
          }

          return Effect.runPromise(Deferred.await(getSessionResponse));
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            fetchSpy.mockRestore();
          })
        );
        const authClient = yield* makeAuthClient({ serverUrl, username });

        yield* manager.setActiveAccount({
          serverUrl,
          username,
          authClient: Option.some(authClient),
        });
        yield* Deferred.fail(getSessionResponse, new Error('get-session request failed'));
        yield* waitForSessionRequest(authClient);

        const failedSession = authClient.useSession.get();
        expect(failedSession).toMatchObject({ data: null, isPending: false });
        expect(failedSession.error).not.toBeNull();

        yield* drainAtomTasks;
        expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
          mode: 'IDLE',
          dismissable: true,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'returns IDLE and is dismissable while a valid session is valid',
    Effect.fnUntraced(
      function* () {
        const { accountsSheetAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const serverUrl = yield* makeServerUrl();
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });

        const { authClient } = Option.getOrThrow(yield* manager.state).state;
        yield* waitForSessionRequest(authClient);
        const validSession = authClient.useSession.get();
        expect(validSession).toMatchObject({ error: null, isPending: false });
        expect(validSession.data).not.toBeNull();

        yield* drainAtomTasks;
        expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
          mode: 'IDLE',
          dismissable: true,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'returns INVALID_SESSION and is dismissable when the session is revoked',
    Effect.fnUntraced(
      function* () {
        const { accountsSheetAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const serverUrl = yield* makeServerUrl();
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        const { authClient } = Option.getOrThrow(yield* manager.state).state;

        const revokeResult = yield* Effect.promise(async () => authClient.signOut());
        expect(revokeResult).toMatchObject({ data: { success: true }, error: null });

        yield* Effect.promise(async () =>
          authClient.useSession.get().refetch({ query: { disableCookieCache: true } })
        );
        yield* waitForSessionRequest(authClient);

        yield* drainAtomTasks;
        expect(
          yield* AtomRegistry.getResult(registry, accountsSheetAtom, { suspendOnWaiting: true })
        ).toEqual({ mode: 'INVALID_SESSION', dismissable: true });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

const setupServerWithUsers = Effect.fnUntraced(function* (
  manager: AccountManager['Service'],
  userCount: number
) {
  const serverUrl = yield* makeServerUrl();
  const adminUsername = yield* makeUsername('test.admin');

  yield* manager.setupServerWithAccount({
    serverUrl,
    name: 'Test Admin',
    email: `${adminUsername}@voel.app`,
    username: adminUsername,
    password: Redacted.make('ha!niceTry'),
  });

  const usernames = [adminUsername];
  for (let index = 1; index < userCount; index += 1) {
    const username = yield* makeUsername(`test.user.${index}`);
    const { authClient } = Option.getOrThrow(yield* manager.state).state;
    const result = yield* Effect.promise(async () =>
      authClient.admin.createUser({
        name: `Test User ${index}`,
        email: `${username}@voel.app`,
        password: 'ha!niceTry',
        role: 'user',
        data: { username },
      })
    );

    expect(result.error).toBeNull();
    usernames.push(username);
  }

  return { serverUrl, usernames };
});

it.layer(TestServerControllerClient.layer)('listAccountsAtom', (iit) => {
  iit.effect(
    'fails with ListAccountsNoAuthClientError when there is no active auth client',
    Effect.fnUntraced(
      function* () {
        const { listAccountsAtom, registry } = yield* makeTestAccountsAtoms();
        const error = yield* AtomRegistry.getResult(registry, listAccountsAtom).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ListAccountsNoAuthClientError);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'paginates real users until the next offset reaches the total',
    Effect.fnUntraced(
      function* () {
        const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
        yield* setupServerWithUsers(manager, 12);
        registry.mount(listAccountsAtom);

        const firstPage = yield* AtomRegistry.getResult(registry, listAccountsAtom, {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        registry.set(listAccountsAtom, void 0);
        const allUsers = yield* AtomRegistry.getResult(registry, listAccountsAtom, {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        registry.set(listAccountsAtom, void 0);
        expect(
          yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
        ).toMatchObject({ done: true, items: allUsers.items });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'uses the current real server after switching accounts',
    Effect.fnUntraced(
      function* () {
        const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();

        const firstServer = yield* setupServerWithUsers(manager, 3);
        const firstResult = yield* AtomRegistry.getResult(registry, listAccountsAtom);
        // @ts-expect-error - better-auth types don't show username is there, but it is in the response
        // oxlint-disable-next-line typescript/no-unsafe-return
        expect(firstResult.items.map((user) => user.username)).toEqual(firstServer.usernames);

        const secondServer = yield* setupServerWithUsers(manager, 6);
        const secondResult = yield* AtomRegistry.getResult(registry, listAccountsAtom);
        // @ts-expect-error - better-auth types don't show username is there, but it is in the response
        // oxlint-disable-next-line typescript/no-unsafe-return
        expect(secondResult.items.map((user) => user.username)).toEqual(secondServer.usernames);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

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
