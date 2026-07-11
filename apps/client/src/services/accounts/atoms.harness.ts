import { Context, Effect, Layer, Option, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { expect, it, spyOn } from '@repo/effect-react-native-harness';

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
type SessionState = Parameters<Parameters<AuthClient['useSession']['subscribe']>[0]>[0];

interface TestUser {
  readonly id: string;
}

interface TestListUsersResult {
  readonly data: {
    readonly users: readonly TestUser[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  } | null;
  readonly error: {
    readonly code?: string;
    readonly message?: string;
    readonly status: number;
    readonly statusText: string;
  } | null;
}

type TestListUsers = (input: {
  readonly query: { readonly limit: number; readonly offset: number };
}) => Promise<TestListUsersResult>;

const mockSession = Effect.fnUntraced(function* (
  authClient: AuthClient,
  overrides: Partial<SessionState> = {}
) {
  const state: SessionState = {
    data: null,
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: async () => void 0,
    ...overrides,
  };
  const subscribeSpy = spyOn(authClient.useSession, 'subscribe').mockImplementation(
    (subscriber) => {
      subscriber(state);

      return () => {
        authClient.useSession.get();
      };
    }
  );

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      subscribeSpy.mockRestore();
    })
  );
});

const listUsersSuccess = (
  users: readonly TestUser[],
  total: number,
  offset: number
): TestListUsersResult => ({
  data: { users, total, limit: 10, offset },
  error: null,
});

const withListUsers = (authClient: AuthClient, listUsers: TestListUsers): AuthClient =>
  new Proxy(authClient, {
    get(target, property, receiver): unknown {
      if (property === 'admin') {
        return { listUsers };
      }

      return Reflect.get(target, property, receiver);
    },
  });

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

it.effect(
  'accountsSheetAtom returns INVALID_SESSION and is dismissable when there is no session',
  Effect.fnUntraced(
    function* () {
      const { accountsSheetAtom, drainAtomTasks, manager, registry } =
        yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://no-session.example.test');
      const username = Account.fields.username.make('no-session');
      const authClient = yield* makeAuthClient({ serverUrl, username });

      yield* mockSession(authClient);
      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.some(authClient),
      });

      yield* drainAtomTasks;
      expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
        mode: 'INVALID_SESSION',
        dismissable: true,
      });
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'accountsSheetAtom returns INVALID_SESSION and is dismissable when the session has an error',
  Effect.fnUntraced(
    function* () {
      const { accountsSheetAtom, drainAtomTasks, manager, registry } =
        yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://session-error.example.test');
      const username = Account.fields.username.make('session-error');
      const authClient = yield* makeAuthClient({ serverUrl, username });

      yield* mockSession(authClient, {
        error: {
          status: 401,
          statusText: 'Unauthorized',
          name: 'Unauthorized',
          message: 'Unauthorized',
          error: 'Unauthorized',
        },
      });
      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.some(authClient),
      });

      yield* drainAtomTasks;
      expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
        mode: 'INVALID_SESSION',
        dismissable: true,
      });
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'accountsSheetAtom returns IDLE and is dismissable when the session is valid',
  Effect.fnUntraced(
    function* () {
      const { accountsSheetAtom, drainAtomTasks, manager, registry } =
        yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://valid-session.example.test');
      const username = Account.fields.username.make('valid-session');
      const authClient = yield* makeAuthClient({ serverUrl, username });

      yield* mockSession(authClient, {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        data: {} as NonNullable<SessionState['data']>,
      });
      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.some(authClient),
      });
      yield* drainAtomTasks;
      registry.mount(accountsSheetAtom);

      expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
        mode: 'IDLE',
        dismissable: true,
      });
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'listAccountsAtom fails with ListAccountsNoAuthClientError when there is no active auth client',
  Effect.fnUntraced(
    function* () {
      const { listAccountsAtom, registry } = yield* makeTestAccountsAtoms();

      const error = yield* AtomRegistry.getResult(registry, listAccountsAtom).pipe(Effect.flip);

      expect(error).toBeInstanceOf(ListAccountsNoAuthClientError);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'listAccountsAtom paginates users until the next offset reaches the total',
  Effect.fnUntraced(
    function* () {
      const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://pagination.example.test');
      const username = Account.fields.username.make('pagination');
      const authClient = yield* makeAuthClient({ serverUrl, username });
      const firstPage = Array.from({ length: 10 }, (_, index) => ({ id: `user-${index}` }));
      const secondPage = [{ id: 'user-10' }, { id: 'user-11' }];
      const offsets: number[] = [];
      const client = withListUsers(authClient, async ({ query }) => {
        offsets.push(query.offset);
        return query.offset === 0
          ? listUsersSuccess(firstPage, 12, 0)
          : listUsersSuccess(secondPage, 12, 10);
      });

      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.some(client),
      });
      registry.mount(listAccountsAtom);

      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ done: false, items: firstPage });

      registry.set(listAccountsAtom, void 0);
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ done: false, items: [...firstPage, ...secondPage] });

      registry.set(listAccountsAtom, void 0);
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ done: true, items: [...firstPage, ...secondPage] });
      expect(offsets).toEqual([0, 10]);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'listAccountsAtom stops pagination on an empty page',
  Effect.fnUntraced(
    function* () {
      const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://empty-page.example.test');
      const username = Account.fields.username.make('empty-page');
      const authClient = yield* makeAuthClient({ serverUrl, username });
      const firstPage = [{ id: 'only-user' }];
      const offsets: number[] = [];
      const client = withListUsers(authClient, async ({ query }) => {
        offsets.push(query.offset);
        return query.offset === 0 ? listUsersSuccess(firstPage, 3, 0) : listUsersSuccess([], 3, 1);
      });

      yield* manager.setActiveAccount({
        serverUrl,
        username,
        authClient: Option.some(client),
      });
      registry.mount(listAccountsAtom);
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ done: false, items: firstPage });

      registry.set(listAccountsAtom, void 0);
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ done: true, items: firstPage });
      expect(offsets).toEqual([0, 1]);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

it.effect(
  'listAccountsAtom uses the current active account auth client after switching accounts',
  Effect.fnUntraced(
    function* () {
      const { drainAtomTasks, listAccountsAtom, manager, registry } =
        yield* makeTestAccountsAtoms();
      const serverUrl = Account.fields.serverUrl.make('http://switch-list-users.example.test');
      const firstUsername = Account.fields.username.make('first');
      const secondUsername = Account.fields.username.make('second');
      const firstAuthClient = yield* makeAuthClient({ serverUrl, username: firstUsername });
      const secondAuthClient = yield* makeAuthClient({ serverUrl, username: secondUsername });
      const firstUser = { id: 'first-user' };
      const secondUser = { id: 'second-user' };
      let firstCalls = 0;
      let secondCalls = 0;
      const firstClient = withListUsers(firstAuthClient, async () => {
        firstCalls += 1;
        return listUsersSuccess([firstUser], 1, 0);
      });
      const secondClient = withListUsers(secondAuthClient, async () => {
        secondCalls += 1;
        return listUsersSuccess([secondUser], 1, 0);
      });

      yield* manager.setActiveAccount({
        serverUrl,
        username: firstUsername,
        authClient: Option.some(firstClient),
      });
      registry.mount(listAccountsAtom);
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ items: [firstUser] });

      yield* manager.setActiveAccount({
        serverUrl,
        username: secondUsername,
        authClient: Option.some(secondClient),
      });
      yield* drainAtomTasks;
      expect(
        yield* AtomRegistry.getResult(registry, listAccountsAtom, { suspendOnWaiting: true })
      ).toMatchObject({ items: [secondUser] });
      expect(firstCalls).toBe(1);
      expect(secondCalls).toBe(1);
    },
    (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
  )
);

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
