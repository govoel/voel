/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import {
  Array,
  Context,
  DateTime,
  Deferred,
  Effect,
  Equal,
  Fiber,
  Layer,
  Option,
  Redacted,
  Scheduler,
  Stream,
} from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { vi } from 'vitest';

import { BetterAuthClientInitializationError } from '@repo/auth-api/client.ts';
import {
  AuthDeviceSession,
  AuthError,
  AuthTransportError,
  AuthUser,
} from '@repo/auth-api/shared.ts';

import { accountsWithActiveAccountAtom } from '#src/app/accounts/index.ts';
import {
  ownSessionsAtom,
  revokeOwnSessionAtom,
  userProfileAtom,
} from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import {
  deleteServerUserAtom,
  serverUserAtom,
  serverUserSessionsAtom,
} from '#src/app/accounts/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/server/users/[id]/sessions/[sessionId]/index.ts';
import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { MainDatabase } from '#src/database/main/index.ts';
import { accountAtom, accountsAtom, activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import {
  AccountsSheet,
  accountsSheetAtom,
} from '#src/domains/accounts/components/auto-presenter/model.ts';
import { NoActiveAccountError } from '#src/domains/accounts/errors.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { Account, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { insertAccountFixture } from '#src/domains/accounts/testing.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/testing/utils.ts';

// The atoms share modules with form hooks; native form widgets are not used here.
vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

describe('account family identity', () => {
  const keyFields = {
    serverUrl: Account.fields.serverUrl.make('https://first.example.test'),
    userId: Account.fields.userId.make('reader'),
    authStorageId: Account.fields.authStorageId.make('storage'),
  };
  const key = ActiveAccountKey.make(keyFields);
  const userId = AuthUser.fields.id.make('reader');
  const sessionId = AuthDeviceSession.fields.id.make('session');

  it('reuses equal keys and separates every account identity field in exposed families', () => {
    const families = [
      accountAtom,
      userProfileAtom,
      accountsWithActiveAccountAtom,
      ownSessionsAtom,
      listUsersAtom,
      accountsSheetAtom,
      (accountKey: Option.Option<ActiveAccountKey>) =>
        ownSessionAtom({ accountKey, id: sessionId }),
      (accountKey: Option.Option<ActiveAccountKey>) => serverUserAtom({ accountKey, userId }),
      (accountKey: Option.Option<ActiveAccountKey>) =>
        serverUserSessionsAtom({ accountKey, userId }),
      (accountKey: Option.Option<ActiveAccountKey>) =>
        serverUserSessionAtom({ accountKey, userId, sessionId }),
    ];
    const otherKeys = [
      ActiveAccountKey.make({
        ...keyFields,
        serverUrl: Account.fields.serverUrl.make('https://second.example.test'),
      }),
      ActiveAccountKey.make({ ...keyFields, userId: Account.fields.userId.make('other-reader') }),
      ActiveAccountKey.make({
        ...keyFields,
        authStorageId: Account.fields.authStorageId.make('other-storage'),
      }),
    ];
    for (const family of families) {
      const atom = family(Option.some(key));
      expect(family(Option.some(ActiveAccountKey.make(key)))).toBe(atom);
      expect(family(Option.none())).not.toBe(atom);
      for (const otherKey of otherKeys) {
        expect(family(Option.some(otherKey))).not.toBe(atom);
      }
    }
  });

  it('includes route user and session arguments in family identity', () => {
    const accountKey = Option.some(key);
    const otherUserId = AuthUser.fields.id.make('other-reader');
    const otherSessionId = AuthDeviceSession.fields.id.make('other-session');
    const own = ownSessionAtom({ accountKey, id: sessionId });
    expect(ownSessionAtom({ accountKey, id: sessionId })).toBe(own);
    expect(ownSessionAtom({ accountKey, id: otherSessionId })).not.toBe(own);

    for (const family of [serverUserAtom, serverUserSessionsAtom]) {
      const atom = family({ accountKey, userId });
      expect(family({ accountKey, userId })).toBe(atom);
      expect(family({ accountKey, userId: otherUserId })).not.toBe(atom);
    }
    const session = serverUserSessionAtom({ accountKey, userId, sessionId });
    expect(serverUserSessionAtom({ accountKey, userId, sessionId })).toBe(session);
    expect(serverUserSessionAtom({ accountKey, userId: otherUserId, sessionId })).not.toBe(session);
    expect(serverUserSessionAtom({ accountKey, userId, sessionId: otherSessionId })).not.toBe(
      session
    );
  });
});

// Route atom callbacks and service fibers through one drainable dispatcher.
// Draining runs queued work; it does not wait for SQL, network requests, or timers.
class TestScheduler extends Context.Service<TestScheduler>()(
  'voel/domains/accounts/atoms.test/TestScheduler',
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

const currentAccountKey = AccountManager.pipe(Effect.flatMap((manager) => manager.state));

const waitForActiveAccountKey = (key: Option.Option<ActiveAccountKey>) =>
  Atom.toStreamResult(activeAccountKeyAtom).pipe(
    Stream.filter((current) => Equal.equals(current, key)),
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

        yield* manager.removeActiveAccount;

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
        expect(yield* Atom.getResult(accountsSheetAtom(Option.none()))).toEqual(
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
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({
            userCount: 1,
          });
          yield* signInTestServerUsers(manager, testServer);
          const sql = yield* MainDatabase;
          yield* sql`
            update account
            set
              active = 0
          `;

          yield* Effect.gen(function* () {
            expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
          yield* insertAccountFixture(account);
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
          expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
          yield* insertAccountFixture(account);
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
          expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
        expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
        yield* Atom.mount(accountsSheetAtom(yield* currentAccountKey));
        yield* waitForAuthenticatedSession(authClient);
        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
          yield* Atom.toStreamResult(accountsSheetAtom(yield* currentAccountKey)).pipe(
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

        const firstSheet = accountsSheetAtom(yield* manager.state);
        yield* Atom.mount(firstSheet);
        yield* drainScheduler;
        expect(yield* Atom.getResult(firstSheet)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );

        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: secondAccount.userId,
        });
        const secondClient = yield* authClients.acquire(Option.getOrThrow(yield* manager.state));
        const secondSheet = accountsSheetAtom(yield* manager.state);
        expect(secondSheet).not.toBe(firstSheet);
        yield* Atom.mount(secondSheet);
        yield* waitForAuthenticatedSession(secondClient);
        yield* secondClient.signOut;
        yield* secondClient.refreshSession({ query: { disableCookieCache: true } });

        expect(
          yield* Atom.toStreamResult(secondSheet).pipe(
            Stream.filter(AccountsSheet.$is('InvalidSession')),
            Stream.runHead
          )
        ).toEqual(Option.some(AccountsSheet.InvalidSession({ dismissable: true })));
        expect(yield* Atom.getResult(firstSheet)).toEqual(
          AccountsSheet.Idle({ dismissable: true })
        );
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

        yield* Atom.mount(accountsSheetAtom(yield* currentAccountKey));
        yield* manager.setActiveAccount({
          serverUrl: testServer.serverUrl,
          userId: account.userId,
        });

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsSheetAtom(yield* currentAccountKey))).toEqual(
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
        const usersAtom = listUsersAtom(yield* manager.state);
        yield* Atom.mount(usersAtom);

        const firstPage = yield* Atom.getResult(usersAtom, {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        yield* Atom.set(usersAtom, void 0);
        const allUsers = yield* Atom.getResult(usersAtom, {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        yield* Atom.set(usersAtom, void 0);
        expect(
          yield* Atom.getResult(usersAtom, {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });

        // Invalidation must restart pagination, not append
        // refreshed rows to the already accumulated pages.
        const target = Option.getOrThrow(
          Array.findFirst(allUsers.items, (user) => user.username !== testServer.adminUsername)
        );
        yield* Atom.set(deleteServerUserAtom, { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const refreshed = yield* Atom.getResult(usersAtom, { suspendOnWaiting: true });
        expect(refreshed.items).toHaveLength(10);
        expect(Array.some(refreshed.items, (user) => user.id === target.id)).toBe(false);
        yield* Atom.set(usersAtom, void 0);
        const remaining = yield* Atom.getResult(usersAtom, { suspendOnWaiting: true });
        expect(remaining.items).toHaveLength(11);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'loads users from the newly active server after switching accounts',
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
        const firstUsernames = Array.map(firstResult.items, (user) => user.username);
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
        expect(yield* Atom.getResult(firstUsers)).toEqual(firstResult);
        const secondUsernames = Array.map(secondResult.items, (user) => user.username);
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
          Array.findFirst(users.users, (user) => user.username !== testServer.adminUsername)
        );
        const currentUser = (yield* client.readSession).user;
        const accountKey = yield* manager.state;
        const detail = serverUserAtom({ accountKey, userId: currentUser.id });
        const usersAtom = listUsersAtom(accountKey);
        yield* Atom.mount(detail);
        yield* Atom.mount(usersAtom);
        yield* Atom.getResult(detail, { suspendOnWaiting: true });
        yield* Atom.getResult(usersAtom, { suspendOnWaiting: true });
        const read = vi.spyOn(client.admin, 'getUser');
        const list = vi.spyOn(client.admin, 'listUsers');
        const { drainScheduler } = yield* TestScheduler;

        yield* Atom.set(deleteServerUserAtom, { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true });
        yield* drainScheduler;
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({
          id: currentUser.id,
        });
        const refreshed = yield* Atom.getResult(usersAtom, { suspendOnWaiting: true });
        expect(Array.some(refreshed.items, (user) => user.id === target.id)).toBe(false);
        expect(read).toHaveBeenCalled();
        expect(list).toHaveBeenCalled();
        read.mockClear();
        list.mockClear();

        yield* Atom.set(deleteServerUserAtom, {
          userId: Account.fields.userId.make('missing-user'),
        });
        yield* Atom.getResult(deleteServerUserAtom, { suspendOnWaiting: true }).pipe(Effect.flip);
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
        const accountKey = yield* manager.state;
        const ownSessions = ownSessionsAtom(accountKey);
        const adminSessions = serverUserSessionsAtom({ accountKey, userId: account.userId });
        yield* Atom.mount(ownSessions);
        yield* Atom.mount(adminSessions);
        expect(
          (yield* Atom.getResult(ownSessions, { suspendOnWaiting: true })).sessions.length
        ).toBeGreaterThan(1);
        yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        const other = Option.getOrThrow(
          Array.findFirst(yield* client.listSessions, (item) => item.id !== session.session.id)
        );

        yield* Atom.set(revokeOwnSessionAtom, { token: other.token });
        yield* Atom.getResult(revokeOwnSessionAtom, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const own = yield* Atom.getResult(ownSessions, { suspendOnWaiting: true });
        const admin = yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        expect(Array.some(own.sessions, (item) => item.id === other.id)).toBe(false);
        expect(Array.some(admin.sessions, (item) => item.id === other.id)).toBe(false);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('accountAtom', (iit) => {
  iit.effect(
    'loads the explicitly selected account created by AccountManager',
    Effect.fnUntraced(
      function* () {
        const serverUrl = yield* makeServerUrl;
        const manager = yield* AccountManager;
        const noAccount = accountAtom(Option.none());
        yield* Atom.mount(noAccount);
        expect(yield* Atom.getResult(noAccount)).toEqual(Option.none());

        const username = yield* makeUsername();
        yield* manager.setupServerWithAccount({
          serverUrl,
          name: 'Test Admin',
          email: `${username}@voel.app`,
          username,
          password: Redacted.make('ha!niceTry'),
        });
        const selectedAccount = accountAtom(yield* manager.state);
        yield* Atom.mount(selectedAccount);
        const account = Option.getOrThrow(yield* Atom.getResult(selectedAccount));
        expect(account).toMatchObject({ serverUrl, username, active: true });
        expect(DateTime.isUtc(account.createdAt)).toBe(true);
        expect(DateTime.isUtc(account.updatedAt)).toBe(true);
        expect(yield* Atom.getResult(noAccount)).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('account-keyed state', (iit) => {
  iit.effect(
    'isolates pending and failed queries, derived views, and mutation clients when switching accounts',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const authClients = yield* AuthClientMap;
        const { drainScheduler } = yield* TestScheduler;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);
        yield* manager.setActiveAccount(firstAccount);
        const firstKey = Option.some(ActiveAccountKey.make(firstAccount));
        const secondKey = Option.some(ActiveAccountKey.make(secondAccount));
        const client = yield* authClients.acquire(Option.getOrThrow(firstKey));
        const session = yield* client.readSession;
        const queriesFor = (accountKey: Option.Option<ActiveAccountKey>) => {
          const queries: ReadonlyArray<
            Atom.Atom<
              AsyncResult.AsyncResult<
                unknown,
                | Atom.Failure<ReturnType<typeof listUsersAtom>>
                | Atom.Failure<ReturnType<typeof accountsSheetAtom>>
              >
            >
          > = [
            ownSessionsAtom(accountKey),
            ownSessionAtom({ accountKey, id: session.session.id }),
            listUsersAtom(accountKey),
            serverUserAtom({ accountKey, userId: firstAccount.userId }),
            serverUserSessionsAtom({ accountKey, userId: firstAccount.userId }),
            serverUserSessionAtom({
              accountKey,
              userId: firstAccount.userId,
              sessionId: session.session.id,
            }),
            accountsSheetAtom(accountKey),
          ];
          return queries;
        };
        const firstQueries = queriesFor(firstKey);
        for (const query of firstQueries) {
          yield* Atom.mount(query);
          yield* Atom.getResult(query);
        }
        const firstProfile = userProfileAtom(firstKey);
        const firstAccounts = accountsWithActiveAccountAtom(firstKey);
        yield* Atom.mount(firstProfile);
        yield* Atom.mount(firstAccounts);
        expect(Option.getOrThrow(yield* Atom.getResult(firstProfile)).id).toBe(firstAccount.userId);
        yield* Atom.getResult(firstAccounts);
        yield* drainScheduler;
        const firstResults = yield* Effect.forEach(firstQueries, (query) => Atom.get(query));
        for (const result of firstResults) {
          expect(AsyncResult.isSuccess(result)).toBe(true);
        }

        const pendingClient = yield* Deferred.make<
          AuthClient['Service'],
          BetterAuthClientInitializationError
        >();
        const { acquire } = authClients;
        const acquireSpy = vi
          .spyOn(authClients, 'acquire')
          .mockImplementation((key) =>
            key.authStorageId === secondAccount.authStorageId
              ? Deferred.await(pendingClient)
              : acquire(key)
          );
        const revokeSpy = vi.spyOn(client, 'revokeSession');
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            acquireSpy.mockRestore();
            revokeSpy.mockRestore();
          })
        );

        yield* manager.setActiveAccount(secondAccount);
        // Mutate before awaiting the identity stream: persisted identity, not its cached result, wins.
        yield* Atom.mount(revokeOwnSessionAtom);
        yield* Atom.set(revokeOwnSessionAtom, { token: session.session.token });
        yield* waitForActiveAccountKey(secondKey);
        const secondQueries = queriesFor(secondKey);
        for (const query of secondQueries) {
          yield* Atom.mount(query);
        }
        yield* drainScheduler;
        for (const query of secondQueries) {
          const result = yield* Atom.get(query);
          expect(result).toMatchObject({ _tag: 'Initial', waiting: true });
          expect(AsyncResult.value(result)).toEqual(Option.none());
        }
        expect(Option.getOrThrow(yield* Atom.getResult(userProfileAtom(secondKey))).id).toBe(
          secondAccount.userId
        );
        expect(
          Option.getOrThrow(
            (yield* Atom.getResult(accountsWithActiveAccountAtom(secondKey))).activeAccount
          ).userId
        ).toBe(secondAccount.userId);
        expect(Option.getOrThrow(yield* Atom.getResult(firstProfile)).id).toBe(firstAccount.userId);
        expect(Option.getOrThrow((yield* Atom.getResult(firstAccounts)).activeAccount).userId).toBe(
          firstAccount.userId
        );
        for (const [index, query] of firstQueries.entries()) {
          expect(yield* Atom.get(query)).toEqual(firstResults[index]);
        }

        yield* Deferred.fail(
          pendingClient,
          BetterAuthClientInitializationError.make({ error: 'offline' })
        );
        for (const query of secondQueries) {
          expect(yield* Atom.getResult(query).pipe(Effect.exit)).toMatchObject({ _tag: 'Failure' });
          const result = yield* Atom.get(query);
          expect(result).toMatchObject({ _tag: 'Failure', previousSuccess: Option.none() });
          expect(AsyncResult.value(result)).toEqual(Option.none());
        }
        for (const [index, query] of firstQueries.entries()) {
          expect(yield* Atom.get(query)).toEqual(firstResults[index]);
        }
        yield* Atom.getResult(revokeOwnSessionAtom, { suspendOnWaiting: true }).pipe(Effect.flip);
        expect(acquireSpy).toHaveBeenCalledWith(
          expect.objectContaining({ authStorageId: secondAccount.authStorageId })
        );
        expect(revokeSpy).not.toHaveBeenCalled();
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'retains only same-account query history when a session refresh fails',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);
        const firstKey = Option.some(ActiveAccountKey.make(firstAccount));
        const secondKey = Option.some(ActiveAccountKey.make(secondAccount));
        const client = yield* AuthClientMap.use((clients) =>
          clients.acquire(Option.getOrThrow(firstKey))
        );
        const firstSessions = ownSessionsAtom(firstKey);
        yield* Atom.mount(firstSessions);
        const loaded = yield* Atom.getResult(firstSessions, { suspendOnWaiting: true });
        const successfulState = yield* Atom.get(firstSessions);
        expect(ownSessionsAtom(Option.some(ActiveAccountKey.make(firstAccount)))).toBe(
          firstSessions
        );

        const offline = AuthError.make({ reason: AuthTransportError.make({ cause: 'offline' }) });
        const { listSessions } = client;
        client.listSessions = Effect.fail(offline);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            client.listSessions = listSessions;
          })
        );
        yield* Atom.refresh(firstSessions);
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        expect(
          yield* Atom.getResult(firstSessions, { suspendOnWaiting: true }).pipe(Effect.flip)
        ).toEqual(offline);
        expect(yield* Atom.get(firstSessions)).toMatchObject({
          _tag: 'Failure',
          previousSuccess: Option.some(successfulState),
        });
        expect(AsyncResult.value(yield* Atom.get(firstSessions))).toEqual(Option.some(loaded));

        const secondSessions = ownSessionsAtom(secondKey);
        expect(secondSessions).not.toBe(firstSessions);
        yield* Atom.mount(secondSessions);
        const secondLoaded = yield* Atom.getResult(secondSessions, { suspendOnWaiting: true });
        expect(secondLoaded.currentId).not.toBe(loaded.currentId);
        expect(
          Array.some(secondLoaded.sessions, (session) => session.id === loaded.currentId)
        ).toBe(false);
        expect(AsyncResult.value(yield* Atom.get(firstSessions))).toEqual(Option.some(loaded));
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});
