/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Array, Cause, Context, DateTime, Deferred, Effect, Fiber, Layer, Option, Redacted, Ref, Scheduler, Stream } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/reactivity';
import { ConnectionError, SqlError } from 'effect/sql/SqlError';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';
import { AuthDeviceSession, AuthError, AuthTransportError, AuthUser } from '@repo/auth-api/shared.ts';
import { accountsWithActiveAccount, removeAccountAtom } from '#src/app/accounts/index.ts';
import { ownSessionsAtom, revokeOwnSessionAtom, userProfileAtom } from '#src/app/accounts/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/profile/sessions/[id]/index.ts';
import { deleteServerUserAtom, serverUserAtom, serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/server/users/[id]/sessions/[sessionId]/index.ts';
import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import { MainDatabase } from '#src/database/main/index.ts';
import { AccountsSheet, accountsSheetAtom } from '#src/domains/accounts/components/auto-presenter/model.ts';
import { accountAtom, accountAuthClientAtom, accountsAtom, activeAccountAtom, activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountStorageKey, Account } from '#src/domains/accounts/schema.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { insertAccountFixture } from '#src/domains/accounts/testing.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import { makeClientTestLayers, makeServerUrl, makeUsername, setupTestServerWithUsers, signInTestServerUsers } from '#src/testing/utils.ts';



// The atoms share modules with form hooks; native form widgets are not used here.
vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

it('canonicalizes session metadata without merging distinct users or sessions', () => {
  const userId = AuthUser.fields.id.make('reader');
  const sessionId = AuthDeviceSession.fields.id.make('session');
  const account = AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId,
    authStorageId: Account.fields.authStorageId.make('login'),
  });
  const input = {
    account,
    userId,
    sessionId,
    extra: 'not query identity',
  };
  const atom = serverUserSessionAtom(input);
  expect(serverUserSessionAtom({ account, userId, sessionId })).toBe(atom);
  expect(
    serverUserSessionAtom({
      account,
      userId: AuthUser.fields.id.make('other-reader'),
      sessionId,
    })
  ).not.toBe(atom);
  const ownInput = { account, id: sessionId, extra: 'not query identity' };
  expect(ownSessionAtom(ownInput)).toBe(ownSessionAtom({ account, id: sessionId }));
  expect(ownSessionAtom(ownInput)).not.toBe(
    ownSessionAtom({
      account,
      id: AuthDeviceSession.fields.id.make('other-session'),
    })
  );
  expect(
    serverUserSessionAtom({
      account,
      userId,
      sessionId: AuthDeviceSession.fields.id.make('other-session'),
    })
  ).not.toBe(atom);
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

// Each registry gets its own services but shares the fixture memo map, including Reactivity.
const makeAccountsAtomsRegistryLayer = () =>
  Layer.fromBuild((memoMap, scope) =>
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
  makeAccountsAtomsRegistryLayer().pipe(
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
            expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(
              AccountsSheet.MustPickAccount({ dismissable: false })
            );
          }).pipe(
            Effect.provide(
              makeAccountsAtomsRegistryLayer().pipe(
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
        const accountKey = Option.getOrThrow(yield* manager.state);
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
    'keeps paginated query results separate across two servers',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        const firstUsers = listUsersAtom(Option.getOrThrow(yield* manager.state));
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
        const secondUsers = listUsersAtom(Option.getOrThrow(yield* manager.state));
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
    'shows the remaining users after deletion and preserves them after a failed deletion',
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
        const accountKey = authClientKey;
        const userList = listUsersAtom(accountKey);
        const deletion = deleteServerUserAtom(accountKey);
        yield* Atom.mount(userList);
        expect(
          (yield* Atom.getResult(userList, { suspendOnWaiting: true })).items
            .map((user) => user.username)
            .sort()
        ).toEqual([...testServer.usernames].sort());
        const { drainScheduler } = yield* TestScheduler;

        yield* Atom.set(deletion, { userId: target.id });
        yield* Atom.getResult(deletion, { suspendOnWaiting: true });
        yield* drainScheduler;
        const refreshed = yield* Atom.getResult(userList, { suspendOnWaiting: true });
        expect(refreshed.items.map((user) => user.username)).toEqual([testServer.adminUsername]);

        yield* Atom.set(deletion, {
          userId: Account.fields.userId.make('missing-user'),
        });
        expect(
          yield* Atom.getResult(deletion, { suspendOnWaiting: true }).pipe(Effect.flip)
        ).toMatchObject({ _tag: 'AuthError' });
        yield* drainScheduler;
        expect(yield* Atom.getResult(userList, { suspendOnWaiting: true })).toEqual(refreshed);
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
        const accountKey = AccountStorageKey.make(account);
        const adminSessions = serverUserSessionsAtom({
          account: accountKey,
          userId: account.userId,
        });
        const ownSessions = ownSessionsAtom(accountKey);
        const revocation = revokeOwnSessionAtom(accountKey);
        yield* Atom.mount(ownSessions);
        yield* Atom.mount(adminSessions);
        const before = yield* Atom.getResult(ownSessions, { suspendOnWaiting: true });
        expect(before.currentId).toBe(session.session.id);
        expect(before.sessions).toHaveLength(2);
        const other = Option.getOrThrow(
          Option.fromNullishOr(before.sessions.find((item) => item.id !== session.session.id))
        );
        expect(
          (yield* Atom.getResult(adminSessions, { suspendOnWaiting: true })).sessions
            .map((item) => item.id)
            .sort()
        ).toEqual([session.session.id, other.id].sort());

        yield* Atom.set(revocation, { token: other.token });
        yield* Atom.getResult(revocation, { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const own = yield* Atom.getResult(ownSessions, { suspendOnWaiting: true });
        const admin = yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        expect(own.currentId).toBe(session.session.id);
        expect(own.sessions.map((item) => item.id)).toEqual([session.session.id]);
        expect(admin.sessions.map((item) => item.id)).toEqual([session.session.id]);
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

it('keys account families by full account/storage identity', () => {
  const first = AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId: Account.fields.userId.make('reader'),
    authStorageId: Account.fields.authStorageId.make('first-login'),
  });
  const nextLogin = AccountStorageKey.make({
    serverUrl: first.serverUrl,
    userId: first.userId,
    authStorageId: Account.fields.authStorageId.make('next-login'),
  });
  const otherServer = AccountStorageKey.make({
    serverUrl: Account.fields.serverUrl.make('https://other.example.com'),
    userId: first.userId,
    authStorageId: first.authStorageId,
  });
  for (const family of [
    accountAtom,
    accountAuthClientAtom,
    ownSessionsAtom,
    listUsersAtom,
    revokeOwnSessionAtom,
  ]) {
    const atom = family(first);
    expect(family(AccountStorageKey.make(first))).toBe(atom);
    expect(family(nextLogin)).not.toBe(atom);
    expect(family(otherServer)).not.toBe(atom);
  }
  for (const family of [serverUserAtom, serverUserSessionsAtom]) {
    const input = { account: first, userId: first.userId, extra: 'not query identity' };
    const atom = family(input);
    expect(family({ account: AccountStorageKey.make(first), userId: first.userId })).toBe(atom);
    expect(family({ account: nextLogin, userId: first.userId })).not.toBe(atom);
    expect(family({ account: otherServer, userId: first.userId })).not.toBe(atom);
  }
});

it.layer(TestServerControllerClient.layer)('account scope transitions', (iit) => {
  iit.effect(
    'a mounted active account drops the previous profile while the new storage lookup is pending or failed',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [first, second] = yield* signInTestServerUsers(manager, testServer);
        const firstKey = AccountStorageKey.make(first);
        const secondKey = AccountStorageKey.make(second);
        const response = yield* Deferred.make<Option.Option<Account>, SqlError>();
        const error = SqlError.make({
          reason: ConnectionError.make({ cause: 'database unavailable' }),
        });
        yield* manager.setActiveAccount(firstKey);

        yield* Effect.gen(function* () {
          const registry = yield* AtomRegistry.AtomRegistry;
          const { drainScheduler } = yield* TestScheduler;
          yield* Atom.mount(activeAccountAtom);
          expect(Option.getOrThrow(yield* Atom.getResult(activeAccountAtom))).toMatchObject({
            userId: first.userId,
            name: 'Test Admin',
            authStorageId: first.authStorageId,
          });
          expect(Option.getOrThrow(yield* Atom.getResult(userProfileAtom(firstKey)))).toMatchObject(
            {
              id: first.userId,
              name: 'Test Admin',
            }
          );

          yield* manager.setActiveAccount(secondKey);
          yield* Atom.toStreamResult(activeAccountKeyAtom).pipe(
            Stream.filter((key) => Option.isSome(key) && key.value.userId === second.userId),
            Stream.runHead
          );
          yield* drainScheduler;
          expect(registry.get(activeAccountAtom)).toMatchObject({ _tag: 'Initial', waiting: true });
          expect(AsyncResult.value(registry.get(activeAccountAtom))).toEqual(Option.none());
          yield* Atom.mount(userProfileAtom(secondKey));
          expect(AsyncResult.value(registry.get(userProfileAtom(secondKey)))).toEqual(
            Option.none()
          );

          yield* Deferred.fail(response, error);
          const failed = Option.getOrThrow(
            yield* Atom.toStream(activeAccountAtom).pipe(
              Stream.filter(AsyncResult.isFailure),
              Stream.runHead
            )
          );
          expect(AsyncResult.error(failed)).toEqual(Option.some(error));
          expect(failed.previousSuccess).toEqual(Option.none());
          expect(AsyncResult.value(failed)).toEqual(Option.none());
          expect(yield* Atom.getResult(userProfileAtom(secondKey)).pipe(Effect.flip)).toEqual(
            error
          );
          expect(Option.getOrThrow(yield* Atom.getResult(userProfileAtom(firstKey))).name).toBe(
            'Test Admin'
          );
        }).pipe(
          Effect.provide(
            makeAccountsAtomsRegistryLayer().pipe(
              Layer.provideMerge(
                Layer.succeed(AccountRepository, {
                  ...repository,
                  getByStorageKey: (key) =>
                    key.authStorageId === second.authStorageId
                      ? Deferred.await(response)
                      : repository.getByStorageKey(key),
                })
              )
            )
          )
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'a pending or failed session request for another scope never exposes the previous account sessions',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const clients = yield* AuthClientMap;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [first, second] = yield* signInTestServerUsers(manager, testServer);
        const firstKey = AccountStorageKey.make(first);
        const secondKey = AccountStorageKey.make(second);
        const firstClient = yield* clients.acquire(firstKey);
        const session = yield* firstClient.readSession;
        const started = yield* Deferred.make<true>();
        const response = yield* Deferred.make<
          Effect.Success<AuthClient['Service']['readSession']>,
          AuthError
        >();
        const error = AuthError.make({
          reason: AuthTransportError.make({ cause: 'server offline' }),
        });

        yield* Effect.gen(function* () {
          const registry = yield* AtomRegistry.AtomRegistry;
          const firstSessions = ownSessionsAtom(firstKey);
          yield* Atom.mount(firstSessions);
          const loaded = yield* Atom.getResult(firstSessions, { suspendOnWaiting: true });
          expect(loaded.currentId).toBe(session.session.id);
          expect(loaded.sessions.find((item) => item.id === loaded.currentId)).toMatchObject({
            userId: first.userId,
            token: session.session.token,
          });

          const nextSessions = ownSessionsAtom(secondKey);
          yield* Atom.mount(nextSessions);
          yield* Deferred.await(started);
          expect(registry.get(nextSessions)).toMatchObject({ _tag: 'Initial', waiting: true });
          expect(AsyncResult.value(registry.get(nextSessions))).toEqual(Option.none());
          yield* Deferred.fail(response, error);
          expect(yield* Atom.getResult(nextSessions).pipe(Effect.flip)).toEqual(error);
          const failed = registry.get(nextSessions);
          expect(failed).toMatchObject({ _tag: 'Failure', previousSuccess: Option.none() });
          expect(AsyncResult.value(failed)).toEqual(Option.none());
          expect(yield* Atom.getResult(firstSessions)).toEqual(loaded);
        }).pipe(
          Effect.provide(
            makeAccountsAtomsRegistryLayer().pipe(
              Layer.provideMerge(
                Layer.succeed(AuthClientMap, {
                  ...clients,
                  acquire: (key) =>
                    clients.acquire(key).pipe(
                      Effect.map((client) =>
                        key.authStorageId === second.authStorageId
                          ? {
                              ...client,
                              readSession: Deferred.succeed(started, true).pipe(
                                Effect.andThen(Deferred.await(response))
                              ),
                            }
                          : client
                      )
                    ),
                })
              )
            )
          )
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'a captured removal of an old login cannot remove or reuse the replacement login for the same user',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const clients = yield* AuthClientMap;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [first] = yield* signInTestServerUsers(manager, testServer);
        const firstKey = AccountStorageKey.make(first);
        const firstClient = yield* clients.acquire(firstKey);
        const firstSession = yield* firstClient.readSession;
        const removalStarted = yield* Deferred.make<AccountStorageKey>();
        const finishRemoval = yield* Deferred.make<true>();

        yield* Effect.gen(function* () {
          const { drainScheduler } = yield* TestScheduler;
          const oldRow = accountAtom(firstKey);
          const oldSessions = ownSessionsAtom(firstKey);
          yield* Atom.mount(oldRow);
          yield* Atom.mount(oldSessions);
          expect(Option.getOrThrow(yield* Atom.getResult(oldRow))).toMatchObject({
            name: 'Test Admin',
            authStorageId: first.authStorageId,
          });
          const before = yield* Atom.getResult(oldSessions, { suspendOnWaiting: true });
          expect(before.currentId).toBe(firstSession.session.id);
          expect(before.sessions.find((session) => session.id === before.currentId)).toMatchObject({
            userId: first.userId,
            token: firstSession.session.token,
          });

          const removal = removeAccountAtom(firstKey);
          yield* Atom.mount(removal);
          yield* Atom.set(removal, void 0);
          expect(yield* Deferred.await(removalStarted)).toEqual(firstKey);
          yield* manager.signInAccount({
            serverUrl: testServer.serverUrl,
            username: testServer.adminUsername,
            password: testServer.password,
          });
          const nextKey = Option.getOrThrow(yield* manager.state);
          expect(nextKey.userId).toBe(first.userId);
          expect(nextKey.authStorageId).not.toBe(first.authStorageId);
          const nextClient = yield* Atom.getResult(accountAuthClientAtom(nextKey));
          const nextSession = yield* nextClient.readSession;
          expect(nextSession.session.id).not.toBe(firstSession.session.id);
          expect(nextSession.user.name).toBe('Test Admin');
          const nextSessions = ownSessionsAtom(nextKey);
          yield* Atom.mount(nextSessions);
          expect((yield* Atom.getResult(nextSessions, { suspendOnWaiting: true })).currentId).toBe(
            nextSession.session.id
          );
          expect((yield* Atom.getResult(oldSessions, { suspendOnWaiting: true })).currentId).toBe(
            firstSession.session.id
          );
          yield* drainScheduler;
          expect(
            yield* Atom.toStreamResult(oldRow).pipe(
              Stream.filter(Option.isNone),
              Stream.runHead,
              Effect.timeout('5 seconds'),
              TestClock.withLive
            )
          ).toEqual(Option.some(Option.none()));

          yield* Deferred.succeed(finishRemoval, true);
          yield* Atom.getResult(removal, { suspendOnWaiting: true });
          yield* drainScheduler;
          expect(yield* Atom.getResult(activeAccountKeyAtom)).toEqual(Option.some(nextKey));
          expect(Option.getOrThrow(yield* Atom.getResult(accountAtom(nextKey)))).toMatchObject({
            name: 'Test Admin',
            authStorageId: nextKey.authStorageId,
            active: true,
          });
          yield* Atom.refresh(nextSessions);
          const remaining = yield* Atom.getResult(nextSessions, { suspendOnWaiting: true });
          expect(remaining.currentId).toBe(nextSession.session.id);
          expect(remaining.sessions.map((session) => session.id)).toContain(nextSession.session.id);
          expect(remaining.sessions.map((session) => session.id)).not.toContain(
            firstSession.session.id
          );
        }).pipe(
          Effect.provide(
            makeAccountsAtomsRegistryLayer().pipe(
              Layer.provideMerge(
                Layer.succeed(AccountManager, {
                  ...manager,
                  removeAccount: (key) =>
                    Deferred.succeed(removalStarted, key).pipe(
                      Effect.andThen(Deferred.await(finishRemoval)),
                      Effect.andThen(manager.removeAccount(key))
                    ),
                })
              )
            )
          )
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it('does not mark an old storage row active when a failed list retains the previous login', () => {
  const row = Account.make({
    serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
    userId: Account.fields.userId.make('reader'),
    authStorageId: Account.fields.authStorageId.make('old-login'),
    username: Account.fields.username.make('reader'),
    name: Account.fields.name.make('Reader'),
    email: Account.fields.email.make('reader@example.com'),
    role: Account.fields.role.make('user'),
    profilePicture: Account.fields.profilePicture.make(null),
    active: Account.fields.active.make(true),
    createdAt: DateTime.makeUnsafe(0),
    updatedAt: DateTime.makeUnsafe(0),
  });
  const nextKey = AccountStorageKey.make({
    serverUrl: row.serverUrl,
    userId: row.userId,
    authStorageId: Account.fields.authStorageId.make('new-login'),
  });
  const error = SqlError.make({ reason: ConnectionError.make({ cause: 'database unavailable' }) });
  const registry = AtomRegistry.make({
    initialValues: [
      Atom.initialValue(activeAccountKeyAtom, AsyncResult.success(Option.some(nextKey))),
      Atom.initialValue(
        accountsAtom,
        AsyncResult.failureWithPrevious(Cause.fail(error), {
          previous: Option.some(AsyncResult.success([row])),
        })
      ),
    ],
  });
  try {
    const view = registry.get(accountsWithActiveAccount);
    expect(AsyncResult.error(view)).toEqual(Option.some(error));
    expect(AsyncResult.value(view)).toEqual(
      Option.some({
        accounts: [row],
        activeAccount: Option.none(),
      })
    );
  } finally {
    registry.dispose();
  }
});

it.layer(TestServerControllerClient.layer)('account-list retry', (iit) => {
  iit.effect(
    'retrying the accounts view replaces a database failure with the current account list and selection',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, testServer);
        const available = yield* Ref.make(false);
        const error = SqlError.make({
          reason: ConnectionError.make({ cause: 'database unavailable' }),
        });
        yield* Effect.gen(function* () {
          yield* Atom.mount(accountsWithActiveAccount);
          expect(yield* Atom.getResult(accountsWithActiveAccount).pipe(Effect.flip)).toEqual(error);
          expect(yield* Atom.getResult(accountAtom(AccountStorageKey.make(account)))).toEqual(
            Option.some(account)
          );
          yield* Ref.set(available, true);
          yield* Atom.refresh(accountsWithActiveAccount);
          yield* (yield* TestScheduler).drainScheduler;
          const loaded = Option.getOrThrow(
            yield* Atom.toStream(accountsWithActiveAccount).pipe(
              Stream.filter(AsyncResult.isSuccess),
              Stream.runHead
            )
          ).value;
          expect(loaded.accounts).toEqual([account]);
          expect(loaded.activeAccount).toEqual(Option.some(account));
        }).pipe(
          Effect.provide(
            makeAccountsAtomsRegistryLayer().pipe(
              Layer.provideMerge(
                Layer.succeed(AccountRepository, {
                  ...repository,
                  list: () =>
                    Ref.get(available).pipe(
                      Effect.flatMap((ready) => (ready ? repository.list() : Effect.fail(error)))
                    ),
                })
              )
            )
          )
        );
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});
