import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Layer, Option, Redacted } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';
import { vi } from 'vitest';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import {
  accountsAtom,
  activeAccountAtom,
  activeAccountSessionAtom,
} from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { NoCurrentAuthClientError } from '#src/services/auth-client/current.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';
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

class AtomTaskScheduler extends Context.Service<AtomTaskScheduler>()(
  'voel/services/accounts/atoms.test/AtomTaskScheduler',
  {
    make: Effect.sync(() => {
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
        drainAtomTasks: Effect.sync(() => {
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
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

const TestAccountsAtomsLayer = Layer.unwrap(
  Effect.gen(function* () {
    const services =
      yield* Effect.context<Layer.Success<ReturnType<typeof makeClientTestLayers>>>();
    const atomTaskScheduler = yield* AtomTaskScheduler;
    const registryLayer = AtomRegistry.layerOptions({
      initialValues: [Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services))],
      scheduleTask: atomTaskScheduler.scheduleTask,
    });

    return Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(Layer.provideMerge(registryLayer));
  })
).pipe(Layer.provideMerge(AtomTaskScheduler.layer));

const makeAccountsAtomsTestLayer = () =>
  TestAccountsAtomsLayer.pipe(Layer.provideMerge(makeClientTestLayers()));

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

it.layer(TestServerControllerClient.layerNoDeps)('accountsAtom', (iit) => {
  iit.effect(
    'reacts to account table mutations',
    Effect.fnUntraced(
      function* () {
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        const manager = yield* AccountManager;
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);

        yield* drainAtomTasks;
        expect(yield* Atom.getResult(accountsAtom)).toMatchObject([
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
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'returns persisted account rows with current active flags',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        expect(yield* Atom.getResult(accountsAtom)).toMatchObject([
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
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

describe('accountsSheetAtom', () => {
  it.effect(
    'shows onboarding and cannot be dismissed when there are no accounts',
    Effect.fnUntraced(
      function* () {
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual({
          mode: 'ONBOARDING',
          dismissable: false,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  it.layer(TestServerControllerClient.layerNoDeps)('with persisted accounts', (iit) => {
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
            expect(yield* Atom.getResult(accountsSheetAtom)).toEqual({
              mode: 'MUST_PICK_ACCOUNT',
              dismissable: false,
            });
          }).pipe(
            Effect.provide(
              Layer.fresh(TestAccountsAtomsLayer).pipe(
                Layer.provideMerge(Layer.fresh(AccountManager.layer))
              )
            )
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });

  describe('session states', () => {
    it.effect(
      'stays idle and dismissable while the session is pending',
      Effect.fnUntraced(
        function* () {
          const { drainAtomTasks } = yield* AtomTaskScheduler;
          const manager = yield* AccountManager;
          const db = yield* MainDatabase;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://pending-session.example.test'),
            userId: Account.fields.userId.make('pending-session-id'),
            username: Account.fields.username.make('pending-session'),
            authStorageId: Account.fields.authStorageId.make('pending-session-auth-storage'),
            role: 'user' as const,
            profilePicture: null,
            active: Account.fields.active.make(0),
          };
          yield* db.execute(db.insertInto('account').values(account));
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
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
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual({
            mode: 'IDLE',
            dismissable: true,
          });
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );

    it.effect(
      'stays idle and dismissable when the session request fails',
      Effect.fnUntraced(
        function* () {
          const { drainAtomTasks } = yield* AtomTaskScheduler;
          const manager = yield* AccountManager;
          const db = yield* MainDatabase;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://failed-session.example.test'),
            userId: Account.fields.userId.make('failed-session-id'),
            username: Account.fields.username.make('failed-session'),
            authStorageId: Account.fields.authStorageId.make('failed-session-auth-storage'),
            role: 'user' as const,
            profilePicture: null,
            active: Account.fields.active.make(0),
          };
          yield* db.execute(db.insertInto('account').values(account));
          const getSessionResponse = yield* Deferred.make<Response, Error>();
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
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
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual({
            mode: 'IDLE',
            dismissable: true,
          });
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });
});

it.layer(TestServerControllerClient.layerNoDeps)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'stays idle and dismissable when the session is valid',
    Effect.fnUntraced(
      function* () {
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        const manager = yield* AccountManager;
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual({
          mode: 'IDLE',
          dismissable: true,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'shows an invalid session and remains dismissable after session revocation',
    Effect.fnUntraced(
      function* () {
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        const manager = yield* AccountManager;
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
          yield* Atom.getResult(accountsSheetAtom, {
            suspendOnWaiting: true,
          })
        ).toEqual({ mode: 'INVALID_SESSION', dismissable: true });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layerNoDeps)('listUsersAtom', (iit) => {
  iit.effect(
    'fails with NoCurrentAuthClientError without an active auth client',
    Effect.fnUntraced(
      function* () {
        const error = yield* Atom.getResult(listUsersAtom).pipe(Effect.flip);

        expect(error).toBeInstanceOf(NoCurrentAuthClientError);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads successive pages until all users are returned',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 12 });
        yield* manager.signInAccount({
          serverUrl: testServer.serverUrl,
          username: testServer.adminUsername,
          password: testServer.password,
        });
        yield* Atom.mount(listUsersAtom);

        const firstPage = yield* Atom.getResult(listUsersAtom, {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        yield* Atom.set(listUsersAtom, void 0);
        const allUsers = yield* Atom.getResult(listUsersAtom, {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        yield* Atom.set(listUsersAtom, void 0);
        expect(
          yield* Atom.getResult(listUsersAtom, {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads users from the newly active server after switching accounts',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        // yield* Atom.mount(listUsersAtom); -- TODO: comment back in
        const firstServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        const firstResult = yield* Atom.getResult(listUsersAtom);
        const firstUsernames = firstResult.items.map((user) => user.username);
        expect(firstUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          firstServer.usernames.sort((first, second) => first.localeCompare(second))
        );

        const secondServer = yield* setupTestServerWithUsers({ userCount: 6 });
        yield* manager.signInAccount({
          serverUrl: secondServer.serverUrl,
          username: secondServer.adminUsername,
          password: secondServer.password,
        });
        const secondResult = yield* Atom.getResult(listUsersAtom);
        const secondUsernames = secondResult.items.map((user) => user.username);
        expect(secondUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          secondServer.usernames.sort((first, second) => first.localeCompare(second))
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layerNoDeps)('activeAccountAtom', (iit) => {
  iit.effect(
    'reflects an account created by AccountManager',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl();

        const manager = yield* AccountManager;
        yield* Atom.mount(activeAccountAtom);

        expect(yield* Atom.getResult(activeAccountAtom)).toBe(Option.none());

        const username = yield* makeUsername();

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });

        const activeAccount = yield* Atom.getResult(activeAccountAtom).pipe(
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
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layerNoDeps)('activeAccountSessionAtom', (iit) => {
  iit.effect(
    'subscribes to authClient.useSession and unsubscribes on account change',
    Effect.fnUntraced(function* () {
      const finalClient = yield* Effect.gen(function* () {
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);
        const firstClient = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
        });
        const secondClient = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
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
        yield* Atom.mount(activeAccountSessionAtom);
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
      }).pipe(Effect.provide(makeAccountsAtomsTestLayer()), Effect.scoped);

      expect(finalClient.unsubscribeCount).toBe(2);
    })
  );

  iit.effect(
    'does not resubscribe when AccountManager emits changes for the same auth client',
    Effect.fnUntraced(
      function* () {
        const { drainAtomTasks } = yield* AtomTaskScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        const client = yield* makeAuthClientWithSpy({
          serverUrl: testServer.serverUrl,
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
        yield* Atom.mount(activeAccountSessionAtom);
        yield* drainAtomTasks;
        expect(client.subscribeCount).toBe(2);
        expect(client.unsubscribeCount).toBe(0);

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
          authClient: Option.some(client.authClient),
        });

        yield* drainAtomTasks;
        const activeAccount = yield* Atom.getResult(activeAccountAtom).pipe(
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
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});
