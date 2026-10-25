/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import {
  Array,
  Context,
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
import { vi } from 'vitest';

import {
  ownSessionsAtom,
  revokeOwnSessionAtom,
} from '#src/app/accounts/(selected)/profile/index.ts';
import { ownSessionAtom } from '#src/app/accounts/(selected)/profile/sessions/[id]/index.ts';
import {
  deleteServerUserAtom,
  serverUserAtom,
  serverUserSessionsAtom,
} from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import { serverUserSessionAtom } from '#src/app/accounts/(selected)/server/users/[id]/sessions/[sessionId]/index.ts';
import { listUsersAtom } from '#src/app/accounts/(selected)/server/users/index.ts';
import { accountsWithActiveAccount, removeAccountAtom } from '#src/app/accounts/index.ts';
import { MainDatabase } from '#src/database/main/index.ts';
import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import {
  AccountsSheet,
  accountsSheetAtom,
} from '#src/domains/accounts/components/auto-presenter/model.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { accountAtom } from '#src/domains/accounts/scope.ts';
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

it.layer(TestServerControllerClient.layer)('accountsAtom', (iit) => {
  iit.effect(
    'removes its captured account even if selection changes, and reports remaining accounts',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, server);
        const removeSecond = removeAccountAtom(ActiveAccountKey.make(secondAccount));
        yield* manager.setActiveAccount({
          serverUrl: firstAccount.serverUrl,
          userId: firstAccount.userId,
        });

        yield* Atom.set(removeSecond, void 0);
        expect(yield* Atom.getResult(removeSecond, { suspendOnWaiting: true })).toEqual({
          accountsRemain: true,
        });
        const repository = yield* AccountRepository;
        expect(yield* repository.getActiveKey).toMatchObject(
          Option.some({ userId: firstAccount.userId })
        );

        yield* manager.setActiveAccount({
          serverUrl: firstAccount.serverUrl,
          userId: firstAccount.userId,
        });
        const removeFirst = removeAccountAtom(ActiveAccountKey.make(firstAccount));
        yield* Atom.set(removeFirst, void 0);
        expect(yield* Atom.getResult(removeFirst, { suspendOnWaiting: true })).toEqual({
          accountsRemain: false,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

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

        yield* manager.removeAccount(ActiveAccountKey.make(account));

        yield* drainScheduler;
        expect(yield* Atom.getResult(accountsAtom)).toEqual([]);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'refreshes persisted account rows through the management projection',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
        const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

        yield* Atom.mount(accountsWithActiveAccount);
        expect(
          Option.getOrThrow((yield* Atom.getResult(accountsWithActiveAccount)).activeAccount)
        ).toMatchObject({
          userId: secondAccount.userId,
          hostname: new URL(testServer.serverUrl).hostname,
        });
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

        // Bypass invalidation: Retry must reach the repository through the mapped atom.
        yield* AccountRepository.use((repository) => repository.setActive(firstAccount));
        yield* Atom.refresh(accountsWithActiveAccount);
        const refreshed = Option.getOrThrow(
          yield* Atom.toStreamResult(accountsWithActiveAccount).pipe(
            Stream.filter(
              ({ activeAccount }) =>
                Option.isSome(activeAccount) && activeAccount.value.userId === firstAccount.userId
            ),
            Stream.runHead
          )
        );
        expect(Option.getOrThrow(refreshed.activeAccount)).toMatchObject({
          userId: firstAccount.userId,
        });
        expect(refreshed.accounts).toMatchObject([
          { userId: firstAccount.userId, active: true },
          { userId: secondAccount.userId, active: false },
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Onboarding());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  it.layer(TestServerControllerClient.layer)('with persisted accounts', (iit) => {
    iit.effect(
      'does not ask to pick an account when the active-key stream lags behind saved accounts',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const server = yield* setupTestServerWithUsers({ userCount: 1 });
          yield* signInTestServerUsers(manager, server);

          yield* Effect.gen(function* () {
            expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());
          }).pipe(
            Effect.provide(
              Layer.fresh(TestAccountsAtomsLayer).pipe(
                Layer.provideMerge(
                  Layer.succeed(AccountManager, {
                    ...manager,
                    changes: Stream.succeed(Option.none()),
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
              AccountsSheet.MustPickAccount()
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
      'stays idle while the session is pending',
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
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );

    it.effect(
      'stays idle when the app starts offline',
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
          expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());
        },
        (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
      )
    );
  });
});

it.layer(TestServerControllerClient.layer)('accountsSheetAtom valid sessions', (iit) => {
  iit.effect(
    'stays idle when the session is valid',
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'shows an invalid session after session revocation',
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());

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
        ).toEqual(Option.some(AccountsSheet.InvalidSession()));
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());

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
        ).toEqual(Option.some(AccountsSheet.InvalidSession()));
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
        expect(yield* Atom.getResult(accountsSheetAtom)).toEqual(AccountsSheet.Idle());
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
        const key = Option.getOrThrow(yield* manager.state);
        yield* Atom.mount(listUsersAtom(key));

        const firstPage = yield* Atom.getResult(listUsersAtom(key), {
          suspendOnWaiting: true,
        });
        expect(firstPage).toMatchObject({ done: false });
        expect(firstPage.items).toHaveLength(10);

        yield* Atom.set(listUsersAtom(key), void 0);
        const allUsers = yield* Atom.getResult(listUsersAtom(key), {
          suspendOnWaiting: true,
        });
        expect(allUsers).toMatchObject({ done: false });
        expect(allUsers.items).toHaveLength(12);

        yield* Atom.set(listUsersAtom(key), void 0);
        expect(
          yield* Atom.getResult(listUsersAtom(key), {
            suspendOnWaiting: true,
          })
        ).toMatchObject({ done: true, items: allUsers.items });

        // Invalidation must restart pagination, not append
        // refreshed rows to the already accumulated pages.
        const target = Option.getOrThrow(
          Array.findFirst(allUsers.items, (user) => user.username !== testServer.adminUsername)
        );
        yield* Atom.set(deleteServerUserAtom(key), { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom(key), { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const refreshed = yield* Atom.getResult(listUsersAtom(key), { suspendOnWaiting: true });
        expect(refreshed.items).toHaveLength(10);
        expect(Array.some(refreshed.items, (user) => user.id === target.id)).toBe(false);
        yield* Atom.set(listUsersAtom(key), void 0);
        const remaining = yield* Atom.getResult(listUsersAtom(key), { suspendOnWaiting: true });
        expect(remaining.items).toHaveLength(11);
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

  iit.effect(
    'keeps queries and mutations bound to their account after selection changes',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const firstServer = yield* setupTestServerWithUsers({ userCount: 12 });
        yield* manager.signInAccount({
          serverUrl: firstServer.serverUrl,
          username: firstServer.adminUsername,
          password: firstServer.password,
        });
        const firstKey = Option.getOrThrow(yield* manager.state);
        const firstUsers = listUsersAtom(firstKey);
        const page = yield* Atom.getResult(firstUsers, { suspendOnWaiting: true });
        expect(page.items).toHaveLength(10);

        const secondServer = yield* setupTestServerWithUsers({ userCount: 3 });
        yield* manager.signInAccount({
          serverUrl: secondServer.serverUrl,
          username: secondServer.adminUsername,
          password: secondServer.password,
        });
        const secondKey = Option.getOrThrow(yield* manager.state);
        const secondUsers = yield* Atom.getResult(listUsersAtom(secondKey), {
          suspendOnWaiting: true,
        });
        expect(Array.map(secondUsers.items, (user) => user.username).sort()).toEqual(
          [...secondServer.usernames].sort()
        );

        // A captured key still targets A while B is selected.
        const victim = Option.getOrThrow(
          Array.findFirst(page.items, (user) => user.username !== firstServer.adminUsername)
        );
        yield* Atom.set(deleteServerUserAtom(firstKey), { userId: victim.id });
        yield* Atom.getResult(deleteServerUserAtom(firstKey), { suspendOnWaiting: true });
        const secondClient = yield* AuthClientMap.use((clients) => clients.acquire(secondKey));
        expect((yield* secondClient.admin.listUsers({ limit: 20, offset: 0 })).users).toHaveLength(
          3
        );
        const firstClient = yield* AuthClientMap.use((clients) => clients.acquire(firstKey));
        expect((yield* firstClient.admin.listUsers({ limit: 20, offset: 0 })).users).toHaveLength(
          11
        );
        const secondSession = (yield* secondClient.readSession).session;
        expect(
          yield* Atom.getResult(
            serverUserSessionAtom({
              account: firstKey,
              userId: firstKey.userId,
              sessionId: secondSession.id,
            })
          )
        ).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('auth query invalidation', (iit) => {
  iit.effect(
    'refreshes the admin session query through its session detail projection',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const key = ActiveAccountKey.make(account);
        const client = yield* AuthClientMap.use((clients) => clients.acquire(key));
        const current = yield* client.readSession;
        const other = Option.getOrThrow(
          Array.findFirst(
            yield* client.listSessions,
            (session) => session.id !== current.session.id
          )
        );
        const detail = serverUserSessionAtom({
          account: key,
          userId: key.userId,
          sessionId: other.id,
        });
        yield* Atom.mount(detail);
        expect(Option.getOrThrow(yield* Atom.getResult(detail))).toMatchObject({
          id: other.id,
          isOtherUser: false,
        });

        // Call the client directly so no mutation atom invalidates the query for us.
        yield* client.admin.revokeUserSession({ sessionToken: other.token });
        yield* Atom.refresh(detail);
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );

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
        const key = Option.getOrThrow(yield* manager.state);
        const client = yield* AuthClientMap.use((authClients) => authClients.acquire(key));
        const users = yield* client.admin.listUsers({ limit: 10, offset: 0 });
        const target = Option.getOrThrow(
          Array.findFirst(users.users, (user) => user.username !== testServer.adminUsername)
        );
        const currentUser = (yield* client.readSession).user;
        const detail = serverUserAtom({ account: key, userId: currentUser.id });
        yield* Atom.mount(detail);
        yield* Atom.mount(listUsersAtom(key));
        yield* Atom.getResult(detail, { suspendOnWaiting: true });
        yield* Atom.getResult(listUsersAtom(key), { suspendOnWaiting: true });
        expect(
          yield* Atom.getResult(serverUserAtom({ account: key, userId: target.id }))
        ).toMatchObject({ id: target.id, isOtherUser: true });
        const { drainScheduler } = yield* TestScheduler;

        yield* Atom.set(deleteServerUserAtom(key), { userId: target.id });
        yield* Atom.getResult(deleteServerUserAtom(key), { suspendOnWaiting: true });
        yield* drainScheduler;
        expect(yield* Atom.getResult(detail, { suspendOnWaiting: true })).toMatchObject({
          id: currentUser.id,
          isOtherUser: false,
        });
        const refreshed = yield* Atom.getResult(listUsersAtom(key), { suspendOnWaiting: true });
        expect(Array.some(refreshed.items, (user) => user.id === target.id)).toBe(false);

        yield* Atom.set(deleteServerUserAtom(key), {
          userId: Account.fields.userId.make('missing-user'),
        });
        yield* Atom.getResult(deleteServerUserAtom(key), { suspendOnWaiting: true }).pipe(
          Effect.flip
        );
        yield* drainScheduler;
        expect(
          (yield* Atom.getResult(listUsersAtom(key), { suspendOnWaiting: true })).items
        ).toEqual(refreshed.items);
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
        const key = ActiveAccountKey.make(account);
        const session = yield* client.readSession;
        const adminSessions = serverUserSessionsAtom({ account: key, userId: account.userId });
        yield* Atom.mount(ownSessionsAtom(key));
        yield* Atom.mount(adminSessions);
        expect(
          (yield* Atom.getResult(ownSessionsAtom(key), { suspendOnWaiting: true })).sessions.length
        ).toBeGreaterThan(1);
        yield* Atom.getResult(adminSessions, { suspendOnWaiting: true });
        const other = Option.getOrThrow(
          Array.findFirst(yield* client.listSessions, (item) => item.id !== session.session.id)
        );
        const ownDetail = ownSessionAtom({ account: key, id: other.id });
        const adminDetail = serverUserSessionAtom({
          account: key,
          userId: account.userId,
          sessionId: other.id,
        });
        yield* Atom.mount(ownDetail);
        yield* Atom.mount(adminDetail);
        expect(
          Option.getOrThrow(yield* Atom.getResult(ownDetail, { suspendOnWaiting: true }))
        ).toMatchObject({ session: { id: other.id }, isCurrent: false });
        expect(
          Option.getOrThrow(yield* Atom.getResult(adminDetail, { suspendOnWaiting: true }))
        ).toMatchObject({ id: other.id, isOtherUser: false });

        yield* Atom.set(revokeOwnSessionAtom(key), { token: other.token });
        yield* Atom.getResult(revokeOwnSessionAtom(key), { suspendOnWaiting: true });
        const { drainScheduler } = yield* TestScheduler;
        yield* drainScheduler;
        const own = yield* Atom.getResult(ownSessionsAtom(key), { suspendOnWaiting: true });
        const admin = yield* Atom.getResult(
          serverUserSessionsAtom({ account: key, userId: account.userId }),
          { suspendOnWaiting: true }
        );
        expect(Array.some(own.sessions, (item) => item.id === other.id)).toBe(false);
        expect(Array.some(admin.sessions, (item) => item.id === other.id)).toBe(false);
        expect(
          yield* Atom.getResult(ownSessionAtom({ account: key, id: other.id }), {
            suspendOnWaiting: true,
          })
        ).toEqual(Option.none());
        expect(
          yield* Atom.getResult(
            serverUserSessionAtom({
              account: key,
              userId: account.userId,
              sessionId: other.id,
            }),
            { suspendOnWaiting: true }
          )
        ).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});

it.layer(TestServerControllerClient.layer)('accountAtom', (iit) => {
  iit.effect(
    'reacts to profile updates without following account selection',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [first, second] = yield* signInTestServerUsers(manager, server);
        const key = ActiveAccountKey.make(first);
        const metadata = accountAtom(key);
        yield* Atom.mount(metadata);
        const original = Option.getOrThrow(yield* Atom.getResult(metadata));
        yield* manager.setActiveAccount(second);
        const repository = yield* AccountRepository;
        yield* repository.updateProfile({
          serverUrl: original.serverUrl,
          userId: original.userId,
          authStorageId: original.authStorageId,
          username: original.username,
          email: original.email,
          role: original.role,
          profilePicture: original.profilePicture,
          name: Account.fields.name.make('Updated profile'),
        });
        const updated = yield* Atom.toStreamResult(metadata).pipe(
          Stream.filter((value) => Option.isSome(value) && value.value.name === 'Updated profile'),
          Stream.runHead
        );
        expect(Option.getOrThrow(Option.getOrThrow(updated))).toMatchObject({
          userId: first.userId,
          name: 'Updated profile',
        });
      },
      (effect) => effect.pipe(Effect.provide(makeAccountsAtomsTestLayer()))
    )
  );
});
