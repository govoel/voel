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
  setupTestServerWithUsers,
  signInTestServerUsers,
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

const waitForSessionRequest = (authClient: AuthClient) =>
  Effect.callback((resume) => {
    let completed = false;
    const completeIfSettled = ({
      isPending,
      isRefetching,
    }: ReturnType<AuthClient['useSession']['get']>) => {
      if (completed || isPending || isRefetching) {
        return;
      }

      completed = true;
      unsubscribe();
      resume(Effect.void);
    };
    const unsubscribe = authClient.useSession.listen(completeIfSettled);

    completeIfSettled(authClient.useSession.get());

    return Effect.sync(unsubscribe);
  });

it.layer(TestServerControllerClient.layer)('accountsAtom', (iit) => {
  iit.effect(
    'reacts to account table mutations',
    Effect.fnUntraced(
      function* () {
        const { accountsAtom, drainAtomTasks, manager, registry } = yield* makeTestAccountsAtoms();

        expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toEqual([]);
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);

        yield* drainAtomTasks;
        expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toMatchObject([
          {
            serverUrl: testServer.serverUrl,
            username: account.username,
            active: 1,
          },
        ]);

        yield* manager.removeAccount({
          serverUrl: testServer.serverUrl,
          userId: account.userId,
        });

        yield* drainAtomTasks;
        expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toEqual([]);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'returns persisted account rows with current active flags',
    Effect.fnUntraced(
      function* () {
        const { accountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        expect(yield* AtomRegistry.getResult(registry, accountsAtom)).toMatchObject([
          {
            serverUrl: testServer.serverUrl,
            username: firstAccount.username,
            active: 0,
          },
          {
            serverUrl: testServer.serverUrl,
            username: secondAccount.username,
            active: 1,
          },
        ]);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

describe('accountsSheetAtom', () => {
  it.effect(
    'shows onboarding and cannot be dismissed when there are no accounts',
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

  it.layer(TestServerControllerClient.layer)('with persisted accounts', (iit) => {
    iit.effect(
      'requires account selection and cannot be dismissed when no account is active',
      Effect.fnUntraced(
        function* () {
          const db = yield* MainDatabase;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({
            userCount: 1,
          });
          yield* signInTestServerUsers(manager, testServer);
          yield* db.execute(
            db
              .updateTable('account')
              .set({ active: Account.fields.active.make(0) })
              .where('serverUrl', '=', testServer.serverUrl)
          );

          yield* Effect.gen(function* () {
            const { accountsSheetAtom, registry } = yield* makeTestAccountsAtoms();

            expect(yield* AtomRegistry.getResult(registry, accountsSheetAtom)).toEqual({
              mode: 'MUST_PICK_ACCOUNT',
              dismissable: false,
            });
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layer)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  describe('session states', () => {
    it.effect(
      'stays idle and dismissable while the session is pending',
      Effect.fnUntraced(
        function* () {
          const { accountsSheetAtom, drainAtomTasks, manager, registry } =
            yield* makeTestAccountsAtoms();
          const db = yield* MainDatabase;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://pending-session.example.test'),
            userId: Account.fields.userId.make('pending-session-id'),
            username: Account.fields.username.make('pending-session'),
            role: 'user' as const,
            profilePicture: null,
            active: Account.fields.active.make(0),
          };
          yield* db.execute(db.insertInto('account').values(account));
          const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            const signal = input instanceof Request ? input.signal : init?.signal;
            if (signal === void 0) {
              throw new Error('Expected the get-session request to have an AbortSignal.');
            }

            return Effect.runPromise(Effect.never, {
              // @ts-expect-error - React Native's AbortSignal type omits DOM-only members.
              signal,
            });
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          const authClient = yield* makeAuthClient({
            serverUrl: account.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
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
      'stays idle and dismissable when the session request fails',
      Effect.fnUntraced(
        function* () {
          const { accountsSheetAtom, drainAtomTasks, manager, registry } =
            yield* makeTestAccountsAtoms();
          const db = yield* MainDatabase;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://failed-session.example.test'),
            userId: Account.fields.userId.make('failed-session-id'),
            username: Account.fields.username.make('failed-session'),
            role: 'user' as const,
            profilePicture: null,
            active: Account.fields.active.make(0),
          };
          yield* db.execute(db.insertInto('account').values(account));
          const getSessionResponse = yield* Deferred.make<Response, Error>();
          const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            return Effect.runPromise(Deferred.await(getSessionResponse));
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          const authClient = yield* makeAuthClient({
            serverUrl: account.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
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
});

it.layer(TestServerControllerClient.layer)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'stays idle and dismissable when the session is valid',
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
    'shows an invalid session and remains dismissable after session revocation',
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
        expect(revokeResult).toMatchObject({
          data: { success: true },
          error: null,
        });

        yield* Effect.promise(async () =>
          authClient.useSession.get().refetch({ query: { disableCookieCache: true } })
        );
        yield* waitForSessionRequest(authClient);

        yield* drainAtomTasks;
        expect(
          yield* AtomRegistry.getResult(registry, accountsSheetAtom, {
            suspendOnWaiting: true,
          })
        ).toEqual({ mode: 'INVALID_SESSION', dismissable: true });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('listAccountsAtom', (iit) => {
  iit.effect(
    'fails with ListAccountsNoAuthClientError without an active auth client',
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
    'loads successive pages until all users are returned',
    Effect.fnUntraced(
      function* () {
        const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();
        const testServer = yield* setupTestServerWithUsers({ userCount: 12 });
        yield* manager.signInAccount({
          serverUrl: testServer.serverUrl,
          username: testServer.adminUsername,
          password: testServer.password,
        });
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
          yield* AtomRegistry.getResult(registry, listAccountsAtom, {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'loads users from the newly active server after switching accounts',
    Effect.fnUntraced(
      function* () {
        const { listAccountsAtom, manager, registry } = yield* makeTestAccountsAtoms();

        const firstServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        const firstResult = yield* AtomRegistry.getResult(registry, listAccountsAtom);
        // @ts-expect-error - better-auth types don't show username is there, but it is in the response
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const firstUsernames = firstResult.items.map((user) => user.username as string);
        expect(firstUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          firstServer.usernames.sort((first, second) => first.localeCompare(second))
        );

        const secondServer = yield* setupTestServerWithUsers({ userCount: 6 });
        yield* manager.signInAccount({
          serverUrl: secondServer.serverUrl,
          username: secondServer.adminUsername,
          password: secondServer.password,
        });
        const secondResult = yield* AtomRegistry.getResult(registry, listAccountsAtom);
        // @ts-expect-error - better-auth types don't show username is there, but it is in the response
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const secondUsernames = secondResult.items.map((user) => user.username as string);
        expect(secondUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          secondServer.usernames.sort((first, second) => first.localeCompare(second))
        );
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('activeAccountAtom', (iit) => {
  iit.effect(
    'reflects an account created by AccountManager',
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
});

it.layer(TestServerControllerClient.layer)('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'subscribes to authClient.useSession and unsubscribes on account change',
    Effect.fnUntraced(function* () {
      const finalClient = yield* Effect.gen(function* () {
        const { activeAccountSessionAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);
        const firstClient = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
          username: firstAccount.username,
        });
        const secondClient = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
          username: secondAccount.username,
        });

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: firstAccount.userId,
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
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
          authClient: Option.some(secondClient.authClient),
        });

        yield* drainAtomTasks;
        expect(firstClient.unsubscribeCount).toBe(2);
        expect(secondClient.subscribeCount).toBe(2);
        return secondClient;
      }).pipe(Effect.provide(makeClientTestLayers()), Effect.scoped);

      expect(finalClient.unsubscribeCount).toBe(2);
    })
  );

  iit.effect(
    'does not resubscribe when AccountManager emits changes for the same auth client',
    Effect.fnUntraced(
      function* () {
        const { activeAccountAtom, activeAccountSessionAtom, drainAtomTasks, manager, registry } =
          yield* makeTestAccountsAtoms();
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        const client = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
          username: firstAccount.username,
        });

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: firstAccount.userId,
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
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
          authClient: Option.some(client.authClient),
        });

        yield* drainAtomTasks;
        const activeAccount = yield* AtomRegistry.getResult(registry, activeAccountAtom).pipe(
          Effect.map(Option.map(({ account }) => account))
        );

        expect(activeAccount.valueOrUndefined).toMatchObject({
          serverUrl: testServer.serverUrl,
          username: secondAccount.username,
        });
        // The extra call is AccountManager refreshing its keepalive subscription for the new account.
        expect(client.subscribeCount).toBe(3);
        expect(client.unsubscribeCount).toBe(1);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
