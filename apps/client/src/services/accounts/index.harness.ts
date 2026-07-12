import { Effect, Layer, Option, Redacted, Schema } from 'effect';
import { hash128 } from 'react-native-xxhash';

import { describe, expect, it } from '@repo/effect-react-native-harness';

import { AccountManager } from '#src/services/accounts/index.ts';
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
} from '#src/services/testing/utils.ts';

const getAccounts = MainDatabase.pipe(
  Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll().orderBy('username')))
);

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
            username,
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
      'upsertAccount signs in, persists the account, and activates it',
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
          yield* manager.upsertAccount({ serverUrl, username, password });

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl,
            username,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([{ serverUrl, username, active: 1 }]);

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
          expect(yield* getAccounts).toMatchObject([{ serverUrl, username, active: 1 }]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  describe('setActiveAccount', () => {
    it.effect(
      'does nothing when the account is already active',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://active.example.test');
          const username = Account.fields.username.make('active');
          const client = yield* makeAuthClientWithSpy({ serverUrl, username });

          yield* manager.setActiveAccount({
            serverUrl,
            username,
            authClient: Option.some(client.authClient),
          });
          const before = yield* manager.state;

          yield* manager.setActiveAccount({
            serverUrl,
            username,
            authClient: Option.some(client.authClient),
          });

          expect(yield* manager.state).toBe(before);
          expect(client.subscribeCount).toBe(1);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([{ serverUrl, username, active: 1 }]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'deactivates the previous account and activates the new one',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://switch.example.test');
          const firstUsername = Account.fields.username.make('first');
          const secondUsername = Account.fields.username.make('second');
          const firstClient = yield* makeAuthClientWithSpy({
            serverUrl,
            username: firstUsername,
          });
          const secondClient = yield* makeAuthClientWithSpy({
            serverUrl,
            username: secondUsername,
          });

          yield* manager.setActiveAccount({
            serverUrl,
            username: firstUsername,
            authClient: Option.some(firstClient.authClient),
          });
          yield* manager.setActiveAccount({
            serverUrl,
            username: secondUsername,
            authClient: Option.some(secondClient.authClient),
          });

          expect((yield* manager.state).valueOrUndefined?.account).toMatchObject({
            serverUrl,
            username: secondUsername,
            active: 1,
          });
          expect(yield* getAccounts).toMatchObject([
            { serverUrl, username: firstUsername, active: 0 },
            { serverUrl, username: secondUsername, active: 1 },
          ]);
          expect(firstClient.unsubscribeCount).toBe(1);
          expect(secondClient.subscribeCount).toBe(1);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'reactivates an existing account without duplicating it',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://reactivate.example.test');
          const firstUsername = Account.fields.username.make('first');
          const secondUsername = Account.fields.username.make('second');

          yield* manager.setActiveAccount({
            serverUrl,
            username: firstUsername,
            authClient: Option.some(yield* makeAuthClient({ serverUrl, username: firstUsername })),
          });
          yield* manager.setActiveAccount({
            serverUrl,
            username: secondUsername,
            authClient: Option.some(yield* makeAuthClient({ serverUrl, username: secondUsername })),
          });
          yield* manager.setActiveAccount({
            serverUrl,
            username: firstUsername,
            authClient: Option.some(yield* makeAuthClient({ serverUrl, username: firstUsername })),
          });

          expect(yield* getAccounts).toMatchObject([
            { serverUrl, username: firstUsername, active: 1 },
            { serverUrl, username: secondUsername, active: 0 },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'closes the previous auth client scope when switching accounts',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://scope-switch.example.test');
          const firstUsername = Account.fields.username.make('first');
          const secondUsername = Account.fields.username.make('second');
          const firstClient = yield* makeAuthClientWithSpy({ serverUrl, username: firstUsername });
          const secondClient = yield* makeAuthClientWithSpy({
            serverUrl,
            username: secondUsername,
          });

          yield* manager.setActiveAccount({
            serverUrl,
            username: firstUsername,
            authClient: Option.some(firstClient.authClient),
          });
          yield* manager.setActiveAccount({
            serverUrl,
            username: secondUsername,
            authClient: Option.some(secondClient.authClient),
          });

          expect(firstClient.unsubscribeCount).toBe(1);
          expect(secondClient.unsubscribeCount).toBe(0);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  describe('removeAccount', () => {
    it.effect(
      'leaves active state unchanged when removing an inactive account',
      Effect.fnUntraced(
        function* () {
          const db = yield* MainDatabase;
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://remove-inactive.example.test');
          const activeUsername = Account.fields.username.make('active');
          const inactiveUsername = Account.fields.username.make('inactive');
          const client = yield* makeAuthClientWithSpy({
            serverUrl,
            username: activeUsername,
          });

          yield* manager.setActiveAccount({
            serverUrl,
            username: activeUsername,
            authClient: Option.some(client.authClient),
          });
          yield* db.execute(
            db.insertInto('account').values({
              serverUrl,
              username: inactiveUsername,
              active: Account.fields.active.make(0),
            })
          );

          const before = yield* manager.state;
          yield* manager.removeAccount({ serverUrl, username: inactiveUsername });

          expect(yield* manager.state).toBe(before);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([
            { serverUrl, username: activeUsername, active: 1 },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'clears active state and closes its scope when removing the active account',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://remove-active.example.test');
          const username = Account.fields.username.make('active');
          const client = yield* makeAuthClientWithSpy({ serverUrl, username });

          yield* manager.setActiveAccount({
            serverUrl,
            username,
            authClient: Option.some(client.authClient),
          });
          yield* manager.removeAccount({ serverUrl, username });

          expect(yield* manager.state).toBe(Option.none());
          expect(client.unsubscribeCount).toBe(1);
          expect(yield* getAccounts).toEqual([]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'does nothing when the account does not exist',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const serverUrl = Account.fields.serverUrl.make('http://remove-missing.example.test');
          const username = Account.fields.username.make('active');
          const client = yield* makeAuthClientWithSpy({ serverUrl, username });

          yield* manager.setActiveAccount({
            serverUrl,
            username,
            authClient: Option.some(client.authClient),
          });
          const before = yield* manager.state;
          yield* manager.removeAccount({
            serverUrl,
            username: Account.fields.username.make('missing'),
          });

          expect(yield* manager.state).toBe(before);
          expect(client.unsubscribeCount).toBe(0);
          expect(yield* getAccounts).toMatchObject([{ serverUrl, username, active: 1 }]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });
});
