import { Deferred, Effect, Fiber, Layer, Option, Redacted, Schema, Stream } from 'effect';
import { hash128 } from 'react-native-xxhash';

import { describe, expect, it } from '@repo/effect-react-native-harness';

import { AccountManager, AccountNotFoundError } from '#src/services/accounts/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
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

const getAccounts = MainDatabase.pipe(
  Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll().orderBy('username')))
);

const forkNextAccountManagerChange = Effect.fnUntraced(function* (
  manager: AccountManager['Service']
) {
  const subscribed = yield* Deferred.make<true>();
  const fiber = yield* manager.changes.pipe(
    Stream.tap(() => Deferred.succeed(subscribed, true)),
    Stream.drop(1),
    Stream.runHead,
    Effect.forkChild
  );
  yield* Deferred.await(subscribed);
  return fiber;
});

describe('AccountManager', () => {
  it.effect(
    'starts without an active account when the database is empty',
    Effect.fnUntraced(
      function* () {
        expect(yield* AccountManager.use((am) => am.state)).toBe(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  it.effect(
    'restores the active account from the database on startup',
    Effect.fnUntraced(
      function* () {
        const db = yield* MainDatabase;
        const serverUrl = Account.fields.serverUrl.make('http://restored.example.test');
        const username = Account.fields.username.make('restored');

        yield* db.execute(
          db.insertInto('account').values({
            serverUrl,
            userId: username,
            username,
            role: 'user',
            active: Account.fields.active.make(1),
          })
        );

        yield* Effect.gen(function* () {
          const manager = yield* AccountManager;

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl,
            username,
            active: 1,
          });
        }).pipe(Effect.provide(Layer.fresh(AccountManager.layer)));
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  class ParsedCookie extends Schema.Class<ParsedCookie, { readonly brand: unique symbol }>(
    'ParsedCookie'
  )({
    'auth.session_token': Schema.Struct({ value: Schema.String }),
  }) {
    public static readonly decodeFromJsonStringEffect = Schema.decodeUnknownEffect(
      Schema.fromJsonString(this)
    );
  }

  it.layer(TestServerControllerClient.layer)('authentication', (iit) => {
    iit.effect(
      'persists auth cookies through AuthClientStorage',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl();
          const username = yield* makeUsername('test.admin');
          const password = Redacted.make('ha!niceTry');
          const manager = yield* AccountManager;

          yield* manager.setupServerWithAccount({
            serverUrl,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            username,
            password,
          });

          const storage = yield* AuthClientStorage;
          const storedCookie = yield* storage.getItem(
            `${hash128(`voel::auth::${serverUrl}::${username}`)}_cookie`
          );

          expect(storedCookie.valueOrUndefined).toContain('auth.session_token');

          yield* Effect.gen(function* () {
            const freshManager = yield* AccountManager;
            const activeAccount = yield* freshManager.state;

            expect(activeAccount.valueOrUndefined?.account).toMatchObject({
              serverUrl,
              username,
              active: 1,
            });

            const parsedCookie = yield* ParsedCookie.decodeFromJsonStringEffect(
              storedCookie.valueOrUndefined
            );
            expect(activeAccount.valueOrUndefined?.state.authClient.getCookie()).toContain(
              `auth.session_token=${parsedCookie['auth.session_token'].value}`
            );
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layer)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'signInAccount signs in, persists the account, and activates it',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl();
          const username = yield* makeUsername();
          const password = Redacted.make('ha!niceTry');
          const manager = yield* AccountManager;

          const authClient = yield* makeAuthClient({ serverUrl, username });
          yield* Effect.promise(async () =>
            authClient.signUp.email({
              name: 'Test User',
              email: `${username}@voel.app`,
              username,
              password: Redacted.value(password),
            })
          );
          yield* manager.signInAccount({ serverUrl, username, password });

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl,
            username,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            { serverUrl, username, role: 'admin', active: 1 },
          ]);

          yield* Effect.gen(function* () {
            const freshManager = yield* AccountManager;
            const activeAccount = yield* freshManager.state;

            expect(activeAccount.valueOrUndefined?.account).toMatchObject({
              serverUrl,
              username,
              active: 1,
            });
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layer)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'setupServerWithAccount signs up, persists the account, and activates it',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl();
          const username = yield* makeUsername('test.admin');
          const manager = yield* AccountManager;

          yield* manager.setupServerWithAccount({
            serverUrl,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            username,
            password: Redacted.make('ha!niceTry'),
          });

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl,
            username,
            active: 1,
          });
          const accounts = yield* getAccounts;
          expect(accounts).toMatchObject([{ serverUrl, username, role: 'admin', active: 1 }]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'synchronizes username and profile picture after the user updates their profile',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl();
          const username = yield* makeUsername('test.admin');
          const updatedUsername = yield* makeUsername('updated.admin');
          const profilePicture = 'https://voel.app/profile.png';
          const manager = yield* AccountManager;

          yield* manager.setupServerWithAccount({
            serverUrl,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            username,
            password: Redacted.make('ha!niceTry'),
          });

          const activeAccount = Option.getOrThrow(yield* manager.state);
          const nextAccountChange = yield* forkNextAccountManagerChange(manager);
          const updateResult = yield* Effect.promise(async () =>
            activeAccount.state.authClient.updateUser({
              username: updatedUsername,
              image: profilePicture,
            })
          );
          expect(updateResult.error).toBeNull();

          const synchronizedState = Option.getOrThrow(yield* Fiber.join(nextAccountChange));
          const synchronizedAccount = Option.getOrThrow(synchronizedState).account;

          expect(synchronizedAccount).toMatchObject({
            serverUrl,
            userId: activeAccount.account.userId,
            username: updatedUsername,
            role: 'admin',
            profilePicture,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl,
              userId: activeAccount.account.userId,
              username: updatedUsername,
              role: 'admin',
              profilePicture,
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'synchronizes a role changed by another account after the session refreshes',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
          const [adminUsername, username] = testServer.usernames;

          yield* manager.signInAccount({
            serverUrl: testServer.serverUrl,
            username,
            password: testServer.password,
          });
          const activeAccount = Option.getOrThrow(yield* manager.state);
          expect(activeAccount.account.role).toBe('user');

          const adminAuthClient = yield* makeAuthClient({
            serverUrl: testServer.serverUrl,
            username: adminUsername,
          });
          const adminSignInResult = yield* Effect.promise(async () =>
            adminAuthClient.signIn.username({
              username: adminUsername,
              password: Redacted.value(testServer.password),
            })
          );
          expect(adminSignInResult.error).toBeNull();

          const roleResult = yield* Effect.promise(async () =>
            adminAuthClient.admin.setRole({
              userId: activeAccount.account.userId,
              role: 'admin',
            })
          );
          expect(roleResult.error).toBeNull();

          const nextAccountChange = yield* forkNextAccountManagerChange(manager);
          yield* Effect.promise(async () =>
            activeAccount.state.authClient.useSession.get().refetch({
              query: { disableCookieCache: true },
            })
          );

          const synchronizedState = Option.getOrThrow(yield* Fiber.join(nextAccountChange));
          const synchronizedAccount = Option.getOrThrow(synchronizedState).account;

          expect(synchronizedAccount).toMatchObject({
            serverUrl: testServer.serverUrl,
            userId: activeAccount.account.userId,
            username,
            role: 'admin',
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              userId: activeAccount.account.userId,
              username,
              role: 'admin',
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  it.layer(TestServerControllerClient.layer)('setActiveAccount', (iit) => {
    iit.effect(
      'fails when the account does not exist',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://profile.example.test');
          const userId = Account.fields.userId.make('missing');
          const error = yield* manager
            .setActiveAccount({
              serverUrl,
              userId,
              authClient: Option.none(),
            })
            .pipe(Effect.flip);

          expect(error).toEqual(new AccountNotFoundError({ serverUrl, userId }));
          expect(yield* manager.state).toBe(Option.none());
          expect(yield* getAccounts).toEqual([]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'does nothing when the account is already active',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const client = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(client.authClient),
          });
          const before = yield* manager.state;

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(client.authClient),
          });

          expect(yield* manager.state).toBe(before);
          expect(client.subscribeCount).toBe(1);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              username: account.username,
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'reinitializes an active account when its auth client changes',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const firstClient = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: account.username,
          });
          const secondClient = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(firstClient.authClient),
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(secondClient.authClient),
          });

          expect((yield* manager.state).valueOrUndefined?.state.authClient).toBe(
            secondClient.authClient
          );
          expect(firstClient.unsubscribeCount).toBe(1);
          expect(secondClient.subscribeCount).toBe(1);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'deactivates the previous account and activates the new one',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
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
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
            authClient: Option.some(secondClient.authClient),
          });

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl: testServer.serverUrl,
            username: secondAccount.username,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
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
          expect(firstClient.unsubscribeCount).toBe(1);
          expect(secondClient.subscribeCount).toBe(1);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'reactivates an existing account without duplicating it',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
          const [firstAccount, secondAccount] = yield* signInTestServerUsers(manager, testServer);

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: firstAccount.userId,
            authClient: Option.some(
              yield* makeAuthClient({
                serverUrl: testServer.serverUrl,
                username: firstAccount.username,
              })
            ),
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
            authClient: Option.some(
              yield* makeAuthClient({
                serverUrl: testServer.serverUrl,
                username: secondAccount.username,
              })
            ),
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: firstAccount.userId,
            authClient: Option.some(
              yield* makeAuthClient({
                serverUrl: testServer.serverUrl,
                username: firstAccount.username,
              })
            ),
          });

          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              username: firstAccount.username,
              active: 1,
            },
            {
              serverUrl: testServer.serverUrl,
              username: secondAccount.username,
              active: 0,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'closes the previous auth client scope when switching accounts',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
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
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
            authClient: Option.some(secondClient.authClient),
          });

          expect(firstClient.unsubscribeCount).toBe(1);
          expect(secondClient.unsubscribeCount).toBe(0);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  it.layer(TestServerControllerClient.layer)('removeAccount', (iit) => {
    iit.effect(
      'leaves active state unchanged when removing an inactive account',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
          const [inactiveAccount, activeAccount] = yield* signInTestServerUsers(
            manager,
            testServer
          );
          const activeUsername = activeAccount.username;
          const client = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: activeUsername,
          });

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: activeAccount.userId,
            authClient: Option.some(client.authClient),
          });

          const before = yield* manager.state;
          yield* manager.removeAccount({
            serverUrl: testServer.serverUrl,
            userId: inactiveAccount.userId,
          });

          expect(yield* manager.state).toBe(before);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              username: activeUsername,
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'clears active state and closes its scope when removing the active account',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const client = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(client.authClient),
          });
          yield* manager.removeAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });

          expect(yield* manager.state).toBe(Option.none());
          expect(client.unsubscribeCount).toBe(1);
          expect(yield* getAccounts).toEqual([]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'does nothing when the account does not exist',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const client = yield* makeAuthClientWithSpy({
            serverUrl: testServer.serverUrl,
            username: account.username,
          });

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
            authClient: Option.some(client.authClient),
          });
          const before = yield* manager.state;
          yield* manager.removeAccount({
            serverUrl: testServer.serverUrl,
            userId: Account.fields.userId.make('missing'),
          });

          expect(yield* manager.state).toBe(before);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              username: account.username,
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });
});
