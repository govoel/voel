/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  DateTime,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Redacted,
  Scheduler,
  Stream,
} from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { accountsWithActiveAccount, removeAccountAtom } from '#src/app/accounts/index.ts';
import {
  activeUserProfileAtom,
  ownSessionsAtom,
  revokeOwnSessionAtom,
} from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import {
  deleteServerUserAtom,
  serverUserAtom,
  serverUserSessionsAtom,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/server/users/[id]/sessions/[sessionId]/index.ts';
import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { AccountsSheet, accountsSheetAtom } from '#src/components/accounts-auto-presenter/model.ts';
import {
  accountAuthClientAtom,
  accountsAtom,
  activeAccountAtom,
  activeAccountKeyAtom,
} from '#src/services/accounts/atoms.ts';
import {
  AccountManager,
  ActiveAccountKey,
  NoActiveAccountError,
} from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/services/testing/utils.ts';

// The atoms share modules with form hooks; native form widgets are not used here.
vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

it('canonicalizes server session keys without merging distinct users or sessions', () => {
  const userId = AuthUser.fields.id.make('reader');
  const sessionId = AuthDeviceSession.fields.id.make('session');
  const input = {
    account: Option.none<ActiveAccountKey>(),
    userId,
    sessionId,
    extra: 'not query identity',
  };
  const atom = serverUserSessionAtom(input);
  expect(serverUserSessionAtom({ account: Option.none(), userId, sessionId })).toBe(atom);
  expect(
    serverUserSessionAtom({
      account: Option.none(),
      userId: AuthUser.fields.id.make('other-reader'),
      sessionId,
    })
  ).not.toBe(atom);
  expect(
    serverUserSessionAtom({
      account: Option.none(),
      userId,
      sessionId: AuthDeviceSession.fields.id.make('other-session'),
    })
  ).not.toBe(atom);
});

// Route atom callbacks and service fibers through one drainable dispatcher.
// Draining runs queued work; it does not wait for SQL, network requests, or timers.
class TestScheduler extends Context.Service<TestScheduler>()(
  'voel/services/accounts/atoms.test/TestScheduler',
  {
    make: Effect.sync(() => {
      const scheduler = new Scheduler.MixedScheduler();
      const dispatcher = scheduler.makeDispatcher();

      return {
        scheduler: {
          executionMode: scheduler.executionMode,
          shouldYield: (fiber) => scheduler.shouldYield(fiber),
          makeDispatcher: () => dispatcher,
        } satisfies Scheduler.Scheduler,
        scheduleTask: (task: () => void) => {
          let active = true;
          dispatcher.scheduleTask(() => {
            if (!active) {
              return;
            }

            active = false;
            task();
          }, 0);

          return () => {
            active = false;
          };
        },
        drainScheduler: Effect.sync(() => {
          dispatcher.flush();
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.unwrap(
    this.pipe(Effect.map(({ scheduler }) => Layer.succeed(Scheduler.Scheduler, scheduler)))
  ).pipe(Layer.provideMerge(Layer.effect(this, this.make)));
}

const TestAccountsAtomsLayer = Layer.fromBuild((memoMap, scope) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<
      | Layer.Success<ReturnType<typeof makeClientTestLayers>>
      | Layer.Success<typeof TestScheduler.layer>
    >();
    const { scheduleTask } = yield* TestScheduler;
    const registryLayer = AtomRegistry.layerOptions({
      initialValues: [
        Atom.initialValue(AppRuntime.layer, Layer.succeedContext(services)),
        Atom.initialValue(Atom.runtime.memoMap, memoMap),
      ],
      scheduleTask,
    });

    return yield* Layer.effectDiscard(Atom.mount(AppRuntime)).pipe(
      Layer.provideMerge(registryLayer),
      (layer) => Layer.buildWithMemoMap(layer, memoMap, scope)
    );
  })
);

const makeAccountsAtomsTestLayer = () =>
  TestAccountsAtomsLayer.pipe(
    Layer.provideMerge(makeClientTestLayers()),
    Layer.provideMerge(TestScheduler.layer)
  );

const waitForSessionRequest = Effect.fnUntraced(function* (authClient: AuthClient['Service']) {
  const session = yield* authClient.getSession;
  if (!session.waiting) {
    return;
  }

  yield* authClient.sessionChanges.pipe(
    Stream.filter((state) => !state.waiting),
    Stream.runHead
  );
});

// A reused client can still hold its pre-sign-in result before Better Auth starts refetching.
const waitForAuthenticatedSession = (authClient: AuthClient['Service']) =>
  authClient.sessionChanges.pipe(
    Stream.filter(
      (session) =>
        AsyncResult.isSuccess(session) && !session.waiting && Option.isSome(session.value)
    ),
    Stream.runHead
  );

it.layer(TestServerControllerClient.layer)('accountsAtom', (iit) => {
  iit.effect(
    'reacts to account table mutations',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsAtom)).toMatchObject([
          {
            serverUrl: testServer.serverUrl,
            username: account.username,
            active: true,
          },
        ]);

        yield* manager.removeAccount(Option.getOrThrow(yield* manager.state));

        yield* drainScheduler;
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
            active: false,
          },
          {
            serverUrl: testServer.serverUrl,
            username: secondAccount.username,
            active: true,
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Onboarding({ dismissable: false })
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  it.layer(TestServerControllerClient.layer)('with persisted accounts', (iit) => {
    iit.effect(
      'requires account selection and cannot be dismissed when no account is active',
      Effect.fnUntraced(
        function* () {
          const accountRepository = yield* AccountRepository;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({
            userCount: 1,
          });
          yield* signInTestServerUsers(manager, testServer);
          yield* accountRepository.deactivateAll();

          yield* Effect.gen(function* () {
            expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
              AccountsSheet.MustPickAccount({ dismissable: false })
            );
          }).pipe(
            Effect.provide(
              Layer.fresh(TestAccountsAtomsLayer).pipe(
                Layer.provideMerge(Layer.fresh(AccountManager.layerNoDeps))
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
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          const { drainScheduler } = yield* TestScheduler;
          const manager = yield* AccountManager;
          const accountRepository = yield* AccountRepository;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://pending-session.example.test'),
            userId: Account.fields.userId.make('pending-session-id'),
            username: Account.fields.username.make('pending-session'),
            name: Account.fields.name.make('Pending Session'),
            email: Account.fields.email.make('pending-session@example.test'),
            authStorageId: Account.fields.authStorageId.make('pending-session-auth-storage'),
            role: Account.fields.role.make('user'),
            profilePicture: Account.fields.profilePicture.make(null),
            active: false,
          };
          yield* accountRepository.upsert(account);
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            const signal = input instanceof Request ? input.signal : init?.signal;
            if (signal === void 0) {
              throw new Error('Expected the get-session request to have an AbortSignal.');
            }

            return runPromise(Effect.never, {
              // @ts-expect-error - React Native's AbortSignal type omits DOM-only members.
              signal,
            });
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
          });

          const activeAccount = Option.getOrThrow(yield* manager.state);
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccount)
          );
          expect(yield* authClient.getSession).toMatchObject({
            _tag: 'Initial',
            waiting: true,
          });
          yield* drainScheduler;
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
            AccountsSheet.Idle({ dismissable: true })
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );

    it.effect(
      'stays idle and dismissable when the app starts offline',
      Effect.fnUntraced(
        function* () {
          const runPromise = Effect.runPromiseWith(yield* Effect.context());
          const { drainScheduler } = yield* TestScheduler;
          const manager = yield* AccountManager;
          const accountRepository = yield* AccountRepository;
          const account = {
            serverUrl: Account.fields.serverUrl.make('http://failed-session.example.test'),
            userId: Account.fields.userId.make('failed-session-id'),
            username: Account.fields.username.make('failed-session'),
            name: Account.fields.name.make('Failed Session'),
            email: Account.fields.email.make('failed-session@example.test'),
            authStorageId: Account.fields.authStorageId.make('failed-session-auth-storage'),
            role: Account.fields.role.make('user'),
            profilePicture: Account.fields.profilePicture.make(null),
            active: false,
          };
          yield* accountRepository.upsert(account);
          const getSessionResponse = yield* Deferred.make<Response, Error>();
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const requestUrl = input instanceof Request ? new URL(input.url) : new URL(input);
            if (requestUrl.pathname !== '/api/auth/get-session') {
              throw new Error(`Unexpected request: ${requestUrl.toString()}`);
            }

            return runPromise(Deferred.await(getSessionResponse));
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              fetchSpy.mockRestore();
            })
          );
          yield* manager.setActiveAccount({
            serverUrl: account.serverUrl,
            userId: account.userId,
          });
          const activeAccount = Option.getOrThrow(yield* manager.state);
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccount)
          );

          yield* Deferred.fail(getSessionResponse, new Error('get-session request failed'));
          yield* authClient.refreshSession({ query: { disableCookieCache: true } });
          yield* waitForSessionRequest(authClient);

          const failedSession = yield* authClient.getSession;
          expect(failedSession).toMatchObject({ _tag: 'Failure', waiting: false });
          expect(Option.isSome(AsyncResult.error(failedSession))).toBe(true);

          yield* drainScheduler;
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
            AccountsSheet.Idle({ dismissable: true })
          );
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });
});

it.layer(TestServerControllerClient.layer)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'stays idle and dismissable when the session is valid',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });

        const activeAccount = Option.getOrThrow(yield* manager.state);
        const authClient = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(activeAccount)
        );
        yield* waitForAuthenticatedSession(authClient);
        const validSession = yield* authClient.getSession;
        expect(validSession).toMatchObject({ _tag: 'Success', waiting: false });
        expect(Option.isSome(Option.flatten(AsyncResult.value(validSession)))).toBe(true);

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'shows an invalid session and remains dismissable after session revocation',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername('test.admin');

        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        const activeAccount = Option.getOrThrow(yield* manager.state);
        const authClient = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(activeAccount)
        );
        yield* Atom.mount(accountsSheetAtom);
        yield* waitForAuthenticatedSession(authClient);
        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );

        const invalidSessionFiber = yield* authClient.sessionChanges.pipe(
          Stream.filter(
            (session) =>
              AsyncResult.isSuccess(session) && !session.waiting && Option.isNone(session.value)
          ),
          Stream.runHead,
          Effect.forkChild
        );
        const revokeResult = yield* authClient.signOut;
        expect(revokeResult).toBe(void 0);

        yield* authClient.refreshSession({ query: { disableCookieCache: true } });
        yield* Fiber.join(invalidSessionFiber);

        expect(
          yield* Atom.toStreamResult(accountsSheetAtom).pipe(
            Stream.filter(AccountsSheet.$is('InvalidSession')),
            Stream.runHead
          )
        ).toEqual(Option.some(AccountsSheet.InvalidSession({ dismissable: true })));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'observes the session of the newly active account after switching accounts',
    Effect.fnUntraced(
      function* () {
        const authClients = yield* AuthClientMap;
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: firstAccount.userId,
        });
        const firstClient = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(firstClient);

        yield* Atom.mount(accountsSheetAtom);
        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
        });
        const secondClient = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(secondClient);
        yield* secondClient.signOut;
        yield* secondClient.refreshSession({ query: { disableCookieCache: true } });

        expect(
          yield* Atom.toStreamResult(accountsSheetAtom).pipe(
            Stream.filter(AccountsSheet.$is('InvalidSession')),
            Stream.runHead
          )
        ).toEqual(Option.some(AccountsSheet.InvalidSession({ dismissable: true })));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'keeps using the same session when the active account is reselected',
    Effect.fnUntraced(
      function* () {
        const authClients = yield* AuthClientMap;
        const { drainScheduler } = yield* TestScheduler;
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);
        const client = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        yield* waitForAuthenticatedSession(client);

        yield* Atom.mount(accountsSheetAtom);
        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: account.userId,
        });

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );
        expect(yield* authClients.acquire(Option.getOrThrow(yield* manager.state))).toBe(client);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('listUsersAtom', (iit) => {
  iit.effect(
    'fails with NoActiveAccountError without an active account',
    Effect.fnUntraced(
      function* () {
        const error = yield* Atom.getResult(listUsersAtom(Option.none())).pipe(Effect.flip);

        expect(error).toBeInstanceOf(NoActiveAccountError);
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
        const accountKey = yield* manager.state;
        const users = listUsersAtom(accountKey);
        const deletion = deleteServerUserAtom(accountKey);
        yield* Atom.mount(users);

        const firstPage = yield* Atom.getResult(users, {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        yield* Atom.set(users, void 0);
        const allUsers = yield* Atom.getResult(users, {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        yield* Atom.set(users, void 0);
        expect(
          yield* Atom.getResult(users, {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });

        // Invalidation must restart pagination, not append
        // refreshed rows to the already accumulated pages.
        const target = allUsers.items.find((user) => user.username !== testServer.adminUsername);
        expect(target).toBeDefined();
        if (!target) {
          return;
        }
        yield* Atom.set(deletion, { userId: target.id });
        yield* Atom.getResult(deletion, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const refreshed = yield* Atom.getResult(users, { suspendOnWaiting: true });
        expect(refreshed.items).toHaveLength(10);
        expect(refreshed.items.some((user) => user.id === target.id)).toBe(false);
        yield* Atom.set(users, void 0);
        const remaining = yield* Atom.getResult(users, { suspendOnWaiting: true });
        expect(remaining.items).toHaveLength(11);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'keeps pagination separate when switching servers',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        const firstUsers = listUsersAtom(yield* manager.state);
        yield* Atom.mount(firstUsers);
        const firstResult = yield* Atom.getResult(firstUsers, { suspendOnWaiting: true });
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
        const secondUsers = listUsersAtom(yield* manager.state);
        expect(secondUsers).not.toBe(firstUsers);
        yield* Atom.mount(secondUsers);
        const secondResult = yield* Atom.getResult(secondUsers, { suspendOnWaiting: true });
        expect(yield* Atom.getResult(firstUsers, { suspendOnWaiting: true })).toEqual(firstResult);
        const secondUsernames = secondResult.items.map((user) => user.username);
        expect(secondUsernames.sort((first, second) => first.localeCompare(second))).toEqual(
          secondServer.usernames.sort((first, second) => first.localeCompare(second))
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('auth query invalidation', (iit) => {
  iit.effect(
    'refreshes user queries after successful mutations, but not failed mutations',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        yield* manager.signInAccount({
          serverUrl: testServer.serverUrl,
          username: testServer.adminUsername,
          password: testServer.password,
        });
        const authClientKey = Option.getOrThrow(yield* manager.state);
        const client = yield* AuthClientMap.use((authClients) =>
          authClients.acquire(authClientKey)
        );
        const users = yield* client.admin.listUsers({ limit: 10, offset: 0 });
        const target = Option.getOrThrow(
          Option.fromNullishOr(
            users.users.find((user) => user.username !== testServer.adminUsername)
          )
        );
        const currentUser = (yield* client.readSession).user;
        const accountKey = Option.some(authClientKey);
        const detail = serverUserAtom({ account: accountKey, userId: currentUser.id });
        const userList = listUsersAtom(accountKey);
        const deletion = deleteServerUserAtom(accountKey);
        yield* Atom.mount(detail);
        yield* Atom.mount(userList);
        yield* Atom.getResult(detail, { suspendOnWaiting: true });
        yield* Atom.getResult(userList, { suspendOnWaiting: true });
        const read = vi.spyOn(client.admin, 'getUser');
        const list = vi.spyOn(client.admin, 'listUsers');
        const { drainScheduler } = yield* TestScheduler;

        yield* Atom.set(deletion, { userId: target.id });
        yield* Atom.getResult(deletion, { suspendOnWaiting: true });
        yield* drainScheduler;
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({
          id: currentUser.id,
        });
        const refreshed = yield* Atom.getResult(userList, { suspendOnWaiting: true });
        expect(refreshed.items.some((user) => user.id === target.id)).toBe(false);
        expect(read).toHaveBeenCalled();
        expect(list).toHaveBeenCalled();
        read.mockClear();
        list.mockClear();

        yield* Atom.set(deletion, {
          userId: Account.fields.userId.make('missing-user'),
        });
        yield* Atom.getResult(deletion, { suspendOnWaiting: true }).pipe(Effect.flip);
        yield* drainScheduler;
        expect(read).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'revoking a device session refreshes both own and admin session queries',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);
        const client = yield* AuthClientMap.use((authClients) => authClients.acquire(account));
        const session = yield* client.readSession;
        const accountKey = Option.some(ActiveAccountKey.make(account));
        const adminSessions = serverUserSessionsAtom({
          account: accountKey,
          userId: account.userId,
        });
        const ownSessions = ownSessionsAtom(accountKey);
        const revocation = revokeOwnSessionAtom(accountKey);
        yield* Atom.mount(ownSessions);
        yield* Atom.mount(adminSessions);
        expect(
          (yield* Atom.getResult(ownSessions, { suspendOnWaiting: true })).sessions.length
        ).toBeGreaterThan(1);
        yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        const other = (yield* client.listSessions).find((item) => item.id !== session.session.id);
        expect(other).toBeDefined();
        if (!other) {
          return;
        }

        yield* Atom.set(revocation, { token: other.token });
        yield* Atom.getResult(revocation, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const own = yield* Atom.getResult(ownSessions, { suspendOnWaiting: true });
        const admin = yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        expect(own.sessions.some((item) => item.id === other.id)).toBe(false);
        expect(admin.sessions.some((item) => item.id === other.id)).toBe(false);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('activeAccountAtom', (iit) => {
  iit.effect(
    'reflects an account created by AccountManager',
    Effect.fnUntraced(
      function* () {
        const { drainScheduler } = yield* TestScheduler;
        const serverUrl = yield* makeServerUrl;

        const manager = yield* AccountManager;
        yield* Atom.mount(activeAccountAtom);

        expect(yield* Atom.getResult(activeAccountAtom)).toBe(Option.none());

        const username = yield* makeUsername();

        const subscribed = yield* Deferred.make<true>();
        // Switching identity clears the old result before the new account query resolves.
        const nextAccount = yield* Atom.toStream(activeAccountAtom).pipe(
          Stream.tap(() => Deferred.succeed(subscribed, true)),
          Stream.drop(1),
          Stream.map((state, index) => {
            if (index === 0) {
              expect(AsyncResult.value(state)).toEqual(Option.none());
            }
            return state;
          }),
          Stream.filter(AsyncResult.isSuccess),
          Stream.mapEffect(AsyncResult.toExit),
          Stream.runHead,
          Effect.forkChild
        );
        yield* Deferred.await(subscribed).pipe(Effect.timeout('10 seconds'), TestClock.withLive);
        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        yield* drainScheduler;

        const activeAccount = Option.getOrThrow(
          Option.getOrThrow(
            yield* Fiber.join(nextAccount).pipe(Effect.timeout('10 seconds'), TestClock.withLive)
          )
        );

        expect(activeAccount).toMatchObject({
          serverUrl,
          username,
          active: true,
        });
        expect(DateTime.isUtc(activeAccount.createdAt)).toBe(true);
        expect(DateTime.isUtc(activeAccount.updatedAt)).toBe(true);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('account query isolation', (iit) => {
  iit.effect(
    'clears account data during a switch and never retains it when the new queries fail',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const clients = yield* AuthClientMap;
        const repository = yield* AccountRepository;
        const registry = yield* AtomRegistry.AtomRegistry;
        const { drainScheduler } = yield* TestScheduler;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [first, second] = yield* signInTestServerUsers(manager, testServer);
        const firstClient = yield* clients.acquire(first);
        const secondClient = yield* clients.acquire(second);
        yield* waitForAuthenticatedSession(firstClient);
        yield* waitForAuthenticatedSession(secondClient);
        yield* manager.setActiveAccount(first);
        const session = yield* firstClient.readSession;
        const firstKey = Option.some(ActiveAccountKey.make(first));
        const secondKey = Option.some(ActiveAccountKey.make(second));

        const queryAtoms = (account: Option.Option<ActiveAccountKey>) =>
          [
            activeAccountAtom,
            activeUserProfileAtom,
            accountsWithActiveAccount(account),
            accountsSheetAtom,
            ownSessionsAtom(account),
            ownSessionAtom({ account, id: session.session.id }),
            listUsersAtom(account),
            serverUserAtom({ account, userId: first.userId }),
            serverUserSessionsAtom({ account, userId: first.userId }),
            serverUserSessionAtom({
              account,
              userId: first.userId,
              sessionId: session.session.id,
            }),
          ] as const;
        const firstQueries: ReadonlyArray<
          Atom.Atom<
            AsyncResult.AsyncResult<unknown, Atom.Failure<ReturnType<typeof queryAtoms>[number]>>
          >
        > = queryAtoms(firstKey);
        for (const query of firstQueries) {
          yield* Atom.mount(query);
          yield* Atom.getResult(query);
          expect(Option.isSome(AsyncResult.value(registry.get(query)))).toBe(true);
        }
        yield* Atom.mount(accountAuthClientAtom(firstKey));
        expect(yield* Atom.getResult(accountAuthClientAtom(firstKey))).toBe(firstClient);
        vi.spyOn(firstClient, 'revokeSession').mockReturnValue(Effect.void);
        yield* Atom.mount(revokeOwnSessionAtom(firstKey));
        yield* Atom.set(revokeOwnSessionAtom(firstKey), { token: session.session.token });
        yield* Atom.getResult(revokeOwnSessionAtom(firstKey), { suspendOnWaiting: true });

        const release = yield* Deferred.make<true>();
        const blocked = Deferred.await(release).pipe(
          Effect.andThen(Effect.die('second account failed'))
        );
        const original = {
          readSession: secondClient.readSession,
          listSessions: secondClient.listSessions,
          sessionChanges: secondClient.sessionChanges,
        };
        Object.assign(secondClient, {
          readSession: blocked,
          listSessions: blocked,
          sessionChanges: Stream.fromEffect(blocked),
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            Object.assign(secondClient, original);
          })
        );
        vi.spyOn(secondClient.admin, 'listUsers').mockReturnValue(blocked);
        vi.spyOn(secondClient.admin, 'getUser').mockReturnValue(blocked);
        vi.spyOn(secondClient.admin, 'listUserSessions').mockReturnValue(blocked);
        const getAccount = repository.getByStorageKey;
        vi.spyOn(repository, 'getByStorageKey').mockImplementation((key) =>
          key.authStorageId === second.authStorageId ? blocked : getAccount(key)
        );

        yield* manager.setActiveAccount(second);
        yield* Atom.toStreamResult(activeAccountKeyAtom).pipe(
          Stream.filter(
            (account) => Option.isSome(account) && account.value.userId === second.userId
          ),
          Stream.runHead
        );
        yield* drainScheduler;
        const queries: typeof firstQueries = queryAtoms(secondKey);
        for (const query of queries) {
          yield* Atom.mount(query);
          expect(registry.get(query)._tag).toBe('Initial');
          expect(AsyncResult.value(registry.get(query))).toEqual(Option.none());
        }
        expect(registry.get(revokeOwnSessionAtom(secondKey))._tag).toBe('Initial');
        expect(yield* Atom.getResult(accountAuthClientAtom(secondKey))).toBe(secondClient);

        yield* Deferred.succeed(release, true);
        for (const query of queries) {
          const failure = Option.getOrThrow(
            yield* Atom.toStream(query).pipe(Stream.filter(AsyncResult.isFailure), Stream.runHead)
          );
          expect(failure.previousSuccess).toEqual(Option.none());
          expect(AsyncResult.value(failure)).toEqual(Option.none());
        }
        // Forms await the captured family member, even when removal switches the active slot to none.
        const removal = removeAccountAtom(secondKey);
        yield* Atom.mount(removal);
        yield* Atom.set(removal, void 0);
        yield* Atom.getResult(removal, { suspendOnWaiting: true });
        yield* Atom.toStreamResult(activeAccountKeyAtom).pipe(
          Stream.filter(Option.isNone),
          Stream.runHead
        );
        yield* drainScheduler;
        expect(yield* Atom.getResult(activeAccountAtom)).toEqual(Option.none());
        expect(yield* Atom.getResult(activeUserProfileAtom)).toEqual(Option.none());
        expect(
          yield* Atom.getResult(ownSessionsAtom(Option.none())).pipe(Effect.flip)
        ).toBeInstanceOf(NoActiveAccountError);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it('keys account families by full account/storage identity', () => {
  const first = ActiveAccountKey.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId: Account.fields.userId.make('reader'),
    authStorageId: Account.fields.authStorageId.make('first-login'),
  });
  const nextLogin = ActiveAccountKey.make({
    serverUrl: first.serverUrl,
    userId: first.userId,
    authStorageId: Account.fields.authStorageId.make('next-login'),
  });
  const otherServer = ActiveAccountKey.make({
    serverUrl: Account.fields.serverUrl.make('https://other.example.com'),
    userId: first.userId,
    authStorageId: first.authStorageId,
  });
  for (const family of [
    accountAuthClientAtom,
    ownSessionsAtom,
    listUsersAtom,
    revokeOwnSessionAtom,
  ]) {
    const atom = family(Option.some(first));
    expect(family(Option.some(ActiveAccountKey.make(first)))).toBe(atom);
    expect(family(Option.some(nextLogin))).not.toBe(atom);
    expect(family(Option.some(otherServer))).not.toBe(atom);
  }
  for (const family of [serverUserAtom, serverUserSessionsAtom]) {
    const atom = family({ account: Option.some(first), userId: first.userId });
    expect(
      family({ account: Option.some(ActiveAccountKey.make(first)), userId: first.userId })
    ).toBe(atom);
    expect(family({ account: Option.some(nextLogin), userId: first.userId })).not.toBe(atom);
    expect(family({ account: Option.some(otherServer), userId: first.userId })).not.toBe(atom);
  }
});
