/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer, Option, Redacted, Schema, Stream } from 'effect';
import { AsyncResult, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager, AccountNotFoundError } from '#src/services/accounts/index.ts';
import { AuthClient, AuthClientKey, acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { TestServerControllerClient } from '#src/services/testing/server-controller/client.ts';
import {
  makeAuthClient,
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/services/testing/utils.ts';

const getAccounts = MainDatabase.pipe(
  Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll().orderBy('username')))
);

const getActiveAccount = MainDatabase.pipe(
  Effect.flatMap((db) =>
    db.executeTakeFirstOption(
      db.selectFrom('account').where('active', '=', Account.fields.active.make(1)).selectAll()
    )
  )
);

const forkNextActiveAccountChange = Effect.gen(function* () {
  const db = yield* MainDatabase;
  const subscribed = yield* Deferred.make<true>();
  const fiber = yield* db
    .executeTakeFirstOption(
      db.selectFrom('account').where('active', '=', Account.fields.active.make(1)).selectAll()
    )
    .pipe(
      Reactivity.stream(['account']),
      Stream.tap(() => Deferred.succeed(subscribed, true)),
      Stream.drop(1),
      Stream.runHead,
      Effect.forkChild
    );
  yield* Deferred.await(subscribed);
  return fiber;
});

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

describe('AccountManager', () => {
  it.effect(
    'reuses auth clients by auth storage identity',
    Effect.fnUntraced(
      function* () {
        const authStorage = {
          serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
          authStorageId: Account.fields.authStorageId.make('auth-storage-id'),
        };
        const [firstClient, secondClient] = yield* Effect.all([
          acquireAuthClient(authStorage),
          acquireAuthClient(authStorage),
        ]).pipe(Effect.scoped);

        expect(secondClient).toBe(firstClient);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

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
        const userId = Account.fields.userId.make('restored-user-id');
        const username = Account.fields.username.make('restored');
        const authStorageId = Account.fields.authStorageId.make('restored-auth-storage');

        yield* db.execute(
          db.insertInto('account').values({
            serverUrl,
            userId,
            username,
            name: Account.fields.name.make('Restored User'),
            email: Account.fields.email.make('restored@example.test'),
            authStorageId,
            role: Account.fields.role.make('user'),
            profilePicture: Account.fields.profilePicture.make(null),
            active: Account.fields.active.make(1),
          })
        );

        yield* Effect.gen(function* () {
          const manager = yield* AccountManager;

          expect((yield* manager.state).valueOrUndefined).toMatchObject({
            serverUrl,
            userId,
            authStorageId,
          });
        }).pipe(Effect.provide(Layer.fresh(AccountManager.layerNoDeps)));
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  class ParsedCookie extends Schema.Class<ParsedCookie, { readonly brand: unique symbol }>(
    'voel/services/accounts/index.test/ParsedCookie'
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
          const serverUrl = yield* makeServerUrl;
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

          const persistedAccount = Option.getOrThrow(yield* manager.state);
          const storage = yield* AuthClientStorage;
          const xxHash = yield* XxHash;
          const storagePrefix = yield* xxHash.hash128(
            `voel::auth::${serverUrl}::${persistedAccount.authStorageId}`
          );
          const storedCookie = yield* storage.getItem(`${storagePrefix}_cookie`);

          expect(storedCookie.valueOrUndefined).toContain('auth.session_token');

          yield* Effect.gen(function* () {
            const freshManager = yield* AccountManager;
            const activeAccount = yield* freshManager.state;

            expect(activeAccount.valueOrUndefined).toMatchObject({
              serverUrl,
              authStorageId: persistedAccount.authStorageId,
            });

            const parsedCookie = yield* ParsedCookie.decodeFromJsonStringEffect(
              storedCookie.valueOrUndefined
            );
            const authClient = yield* acquireAuthClient(Option.getOrThrow(activeAccount));
            const cookie = yield* authClient.getCookie;
            expect(Option.getOrThrow(cookie)).toContain(
              `auth.session_token=${parsedCookie['auth.session_token'].value}`
            );
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layerNoDeps)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'signInAccount signs in, persists the account, and activates it',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl;
          const username = yield* makeUsername();
          const password = Redacted.make('ha!niceTry');
          const manager = yield* AccountManager;

          const authClient = yield* makeAuthClient({ serverUrl });
          yield* authClient.signUp.email({
            name: 'Test User',
            email: `${username}@voel.app`,
            username,
            password: Redacted.value(password),
          });
          yield* manager.signInAccount({ serverUrl, username, password });

          expect((yield* manager.state).valueOrUndefined).toMatchObject({
            serverUrl,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl,
              username,
              name: 'Test User',
              email: `${username}@voel.app`,
              role: 'admin',
              active: 1,
            },
          ]);

          yield* Effect.gen(function* () {
            const freshManager = yield* AccountManager;
            const activeAccount = yield* freshManager.state;

            expect(activeAccount.valueOrUndefined).toMatchObject({
              serverUrl,
            });
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layerNoDeps)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'setupServerWithAccount signs up, persists the account, and activates it',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl;
          const username = yield* makeUsername('test.admin');
          const manager = yield* AccountManager;

          yield* manager.setupServerWithAccount({
            serverUrl,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            username,
            password: Redacted.make('ha!niceTry'),
          });

          expect((yield* manager.state).valueOrUndefined).toMatchObject({
            serverUrl,
          });
          const accounts = yield* getAccounts;
          expect(accounts).toMatchObject([
            {
              serverUrl,
              username,
              name: 'Test Admin',
              email: `${username}@voel.app`,
              role: 'admin',
              active: 1,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'synchronizes profile metadata while preserving auth storage across a username change',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl;
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

          const activeAccountKey = Option.getOrThrow(yield* manager.state);
          const nextAccountChange = yield* forkNextActiveAccountChange;
          const authClient = yield* acquireAuthClient(activeAccountKey);
          yield* authClient.updateUser({
            username: updatedUsername,
            image: profilePicture,
          });

          const synchronizedState = Option.getOrThrow(yield* Fiber.join(nextAccountChange));
          const synchronizedAccount = Option.getOrThrow(synchronizedState);

          expect(synchronizedAccount).toMatchObject({
            serverUrl,
            userId: activeAccountKey.userId,
            username: updatedUsername,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            authStorageId: activeAccountKey.authStorageId,
            role: 'admin',
            profilePicture,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl,
              userId: activeAccountKey.userId,
              username: updatedUsername,
              name: 'Test Admin',
              email: `${username}@voel.app`,
              authStorageId: activeAccountKey.authStorageId,
              role: 'admin',
              profilePicture,
              active: 1,
            },
          ]);

          const storage = yield* AuthClientStorage;
          const xxHash = yield* XxHash;
          const storagePrefix = yield* xxHash.hash128(
            `voel::auth::${serverUrl}::${synchronizedAccount.authStorageId}`
          );
          const storedCookie = yield* storage.getItem(`${storagePrefix}_cookie`);
          const parsedCookie = yield* ParsedCookie.decodeFromJsonStringEffect(
            storedCookie.valueOrUndefined
          );

          yield* Effect.gen(function* () {
            const freshManager = yield* AccountManager;
            const restoredAccount = Option.getOrThrow(yield* freshManager.state);

            expect(restoredAccount).toMatchObject({
              serverUrl,
              authStorageId: synchronizedAccount.authStorageId,
            });
            expect((yield* getActiveAccount).valueOrUndefined).toMatchObject({
              username: updatedUsername,
            });
            const restoredAuthClient = yield* acquireAuthClient(restoredAccount);
            const cookie = yield* restoredAuthClient.getCookie;
            expect(Option.getOrThrow(cookie)).toContain(
              `auth.session_token=${parsedCookie['auth.session_token'].value}`
            );
          }).pipe(Effect.provide(Layer.fresh(AccountManager.layerNoDeps)));
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'updates the active user profile',
      Effect.fnUntraced(
        function* () {
          const serverUrl = yield* makeServerUrl;
          const username = yield* makeUsername('test.admin');
          const updatedUsername = yield* makeUsername('updated.admin');
          const manager = yield* AccountManager;

          yield* manager.setupServerWithAccount({
            serverUrl,
            name: 'Test Admin',
            email: `${username}@voel.app`,
            username,
            password: Redacted.make('ha!niceTry'),
          });

          const nextAccountChange = yield* forkNextActiveAccountChange;
          const activeAccountKey = Option.getOrThrow(yield* manager.state);
          const authClient = yield* acquireAuthClient(activeAccountKey);
          yield* authClient.updateUser({
            name: 'Updated Admin',
            username: updatedUsername,
          });

          const synchronizedState = Option.getOrThrow(yield* Fiber.join(nextAccountChange));
          const synchronizedAccount = Option.getOrThrow(synchronizedState);
          expect(synchronizedAccount).toMatchObject({
            name: 'Updated Admin',
            username: updatedUsername,
          });
          const session = Option.getOrThrow(
            Option.flatten(AsyncResult.value(yield* authClient.getSession))
          );
          expect(session.user).toMatchObject({
            name: 'Updated Admin',
            username: updatedUsername,
          });
          expect(yield* getAccounts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'Updated Admin',
                username: updatedUsername,
              }),
            ])
          );
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
          const activeAccountKey = Option.getOrThrow(yield* manager.state);
          expect(Option.getOrThrow(yield* getActiveAccount).role).toBe('user');
          const authClient = yield* acquireAuthClient(activeAccountKey);
          yield* waitForSessionRequest(authClient);

          const adminAuthClient = yield* makeAuthClient({
            serverUrl: testServer.serverUrl,
          });
          yield* adminAuthClient.signIn.username({
            username: adminUsername,
            password: Redacted.value(testServer.password),
          });

          yield* adminAuthClient.admin.setRole({
            userId: activeAccountKey.userId,
            role: 'admin',
          });

          const nextAccountChange = yield* forkNextActiveAccountChange;
          yield* authClient.refreshSession({ query: { disableCookieCache: true } });

          const synchronizedState = Option.getOrThrow(yield* Fiber.join(nextAccountChange));
          const synchronizedAccount = Option.getOrThrow(synchronizedState);

          expect(synchronizedAccount).toMatchObject({
            serverUrl: testServer.serverUrl,
            userId: activeAccountKey.userId,
            username,
            role: 'admin',
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              userId: activeAccountKey.userId,
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
            })
            .pipe(Effect.flip);

          expect(error).toEqual(AccountNotFoundError.make({ serverUrl, userId }));
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

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });
          const before = yield* manager.state;

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });

          expect(yield* manager.state).toEqual(before);
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
      'reuses the mapped auth client for an active account',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const firstState = Option.getOrThrow(yield* manager.state);
          const firstClient = yield* acquireAuthClient(firstState);

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });

          const currentState = Option.getOrThrow(yield* manager.state);
          expect(yield* acquireAuthClient(currentState)).toBe(firstClient);
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

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: firstAccount.userId,
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
          });

          expect((yield* manager.state).valueOrUndefined).toMatchObject({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
            authStorageId: secondAccount.authStorageId,
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
          const activeAccount = Option.getOrThrow(yield* manager.state);
          expect(yield* acquireAuthClient(activeAccount)).toBeDefined();
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
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: secondAccount.userId,
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: firstAccount.userId,
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
      'does not retain the active account auth client',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          yield* signInTestServerUsers(manager, testServer);

          const activeAccount = Option.getOrThrow(yield* manager.state);
          const firstClient = yield* acquireAuthClient(activeAccount).pipe(Effect.scoped);
          const secondClient = yield* acquireAuthClient(activeAccount).pipe(Effect.scoped);

          expect(secondClient).not.toBe(firstClient);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  it.layer(TestServerControllerClient.layer)('removeActiveAccount', (iit) => {
    const storageItems = new Map<string, string>();

    iit.effect(
      'revokes the Better Auth session and clears its secure storage',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const storage = yield* AuthClientStorage;
          const xxHash = yield* XxHash;
          const storagePrefix = yield* xxHash.hash128(
            `voel::auth::${testServer.serverUrl}::${account.authStorageId}`
          );
          const storedCookie = yield* storage.getItem(`${storagePrefix}_cookie`);
          expect(Option.isSome(storedCookie)).toBe(true);

          const verificationAuthStorageId = Account.fields.authStorageId.make(
            'removed-account-session-verification'
          );
          const verificationStoragePrefix = yield* xxHash.hash128(
            `voel::auth::${testServer.serverUrl}::${verificationAuthStorageId}`
          );
          const verificationStorage = new Map([
            [`${verificationStoragePrefix}_cookie`, Option.getOrThrow(storedCookie)],
          ]);
          const verificationAuthClient = yield* AuthClient.pipe(
            Effect.provide(
              AuthClient.layerNoDeps(
                new AuthClientKey({
                  serverUrl: testServer.serverUrl,
                  authStorageId: verificationAuthStorageId,
                })
              ).pipe(
                Layer.provide(
                  Layer.mergeAll(AuthClientStorage.layerTest(verificationStorage), XxHash.layerTest)
                )
              )
            )
          );
          yield* verificationAuthClient.refreshSession({ query: { disableCookieCache: true } });
          yield* waitForSessionRequest(verificationAuthClient);
          const sessionBeforeRemoval = yield* verificationAuthClient.getSession;
          expect(
            Option.getOrThrow(Option.flatten(AsyncResult.value(sessionBeforeRemoval)))
          ).toMatchObject({
            user: { id: account.userId },
          });

          yield* manager.removeActiveAccount;

          expect(storageItems.size).toEqual(0);
          yield* verificationAuthClient.refreshSession({ query: { disableCookieCache: true } });
          yield* waitForSessionRequest(verificationAuthClient);
          const sessionAfterRemoval = yield* verificationAuthClient.getSession;
          expect(sessionAfterRemoval).toMatchObject({ _tag: 'Success', waiting: false });
          expect(Option.isNone(Option.flatten(AsyncResult.value(sessionAfterRemoval)))).toBe(true);
          expect(yield* getAccounts).toEqual([]);
          expect(yield* manager.state).toBe(Option.none());
        },
        (effect) => effect.pipe(Effect.scoped, Effect.provide(makeClientTestLayers(storageItems)))
      )
    );
  });
});
