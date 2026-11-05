import { expect, it } from '@effect/vitest';
import { Array, Effect, Exit, Fiber, Layer, Option, Redacted, Scope, Stream } from 'effect';
import { AsyncResult, Reactivity } from 'effect/reactivity';

import { MainDatabase } from '#src/database/main/index.ts';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import {
  makeClientTestLayers,
  makeServerUrl,
  makeUsername,
  setupTestServerWithUsers,
  signInTestServerUsers,
} from '#src/testing/utils.ts';

it.layer(TestServerControllerClient.layer)('AccountManager', (iit) => {
  iit.effect(
    'sets up an account atomically and restores authentication using only the encrypted database row',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const sql = yield* MainDatabase;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername();
        const key = yield* manager.setupServerWithAccount({
          serverUrl,
          username,
          name: 'First Admin',
          email: `${username}@example.test`,
          password: Redacted.make('test-password-12345'),
        });
        expect(key).toBeInstanceOf(AccountKey);
        const state = yield* manager.state;
        expect(state).toEqual(Option.some(key));
        const findByKeyResult = yield* repository.findByKey(key);
        expect(Option.getOrThrow(findByKeyResult)).toMatchObject({
          key,
          username,
          name: 'First Admin',
          role: 'admin',
          active: true,
        });
        const storage = yield* repository.readAuthStorage(key);
        expect(storage['voel_cookie']).toContain('auth.session_token');
        const rows = yield* sql<{ authStorage: string }>`
          select
            "authStorage"
          from
            account
        `;
        expect(rows[0]?.authStorage).not.toContain('auth.session_token');
        yield* Effect.gen(function* () {
          const clients = yield* AuthClientMap;
          const client = yield* clients.acquire(key);
          const getCookie = yield* client.getCookie;
          expect(getCookie).toMatchObject({ _tag: 'Some' });
          expect((yield* client.readSession).user.id).toEqual(key.userId);
        }).pipe(Effect.provide(Layer.fresh(AuthClientMap.layerNoDeps)));
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'reuses the database identity on repeated username login and replaces its credentials',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const clients = yield* AuthClientMap;
        const shared = yield* clients.acquire(account.key);
        const previousSession = yield* shared.readSession;
        const before = yield* repository.readAuthStorage(account.key);
        const key = yield* manager.signInAccount({
          serverUrl: server.serverUrl,
          username: server.adminUsername,
          password: server.password,
        });
        const acquireResult = yield* clients.acquire(key);
        expect(acquireResult).toBe(shared);
        const current = yield* shared.sessionChanges.pipe(
          Stream.filter(
            (state) =>
              AsyncResult.isSuccess(state) &&
              !state.waiting &&
              Option.isSome(state.value) &&
              state.value.value.session.token !== previousSession.session.token
          ),
          Stream.runHead
        );
        expect(Option.isSome(current)).toBe(true);
        expect(key).toEqual(account.key);
        const list = yield* repository.list;
        expect(list).toHaveLength(1);
        const state2 = yield* manager.state;
        expect(state2).toEqual(Option.some(key));
        expect((yield* repository.readAuthStorage(key))['voel_cookie']).not.toBe(
          before['voel_cookie']
        );
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'leaves the previous account and credentials unchanged when authentication fails',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        const before = yield* repository.list;
        const credentials = yield* repository.readAuthStorage(account.key);
        const error = yield* manager
          .signInAccount({
            serverUrl: server.serverUrl,
            username: server.adminUsername,
            password: Redacted.make('wrong-password'),
          })
          .pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: 'AccountSignInError' });
        const list = yield* repository.list;
        expect(list).toEqual(before);
        const readAuthStorageResult = yield* repository.readAuthStorage(account.key);
        expect(readAuthStorageResult).toEqual(credentials);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'recovers a server account through sign-in when its first local setup transaction failed',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const sql = yield* MainDatabase;
        const existingServer = yield* setupTestServerWithUsers({ userCount: 1 });
        const [existing] = yield* signInTestServerUsers(manager, existingServer);
        const before = yield* repository.list;
        const serverUrl = yield* makeServerUrl;
        const username = yield* makeUsername();
        const password = Redacted.make('test-password-12345');
        yield* sql`
          create trigger reject_new_account before insert on account begin
          select
            raise (abort, 'forced setup failure');

          end
        `;
        const exit = yield* manager
          .setupServerWithAccount({
            serverUrl,
            username,
            name: 'New Admin',
            email: `${username}@example.test`,
            password,
          })
          .pipe(Effect.exit);
        expect(exit._tag).toBe('Failure');
        const state = yield* manager.state;
        expect(state).toEqual(Option.some(existing.key));
        const list = yield* repository.list;
        expect(list).toEqual(before);
        yield* sql`
          drop trigger reject_new_account
        `;
        const recovered = yield* manager.signInAccount({ serverUrl, username, password });
        expect(recovered).toBeInstanceOf(AccountKey);
        const list2 = yield* repository.list;
        expect(list2).toHaveLength(2);
        const findByKeyResult = yield* repository.findByKey(recovered);
        expect(Option.getOrThrow(findByKeyResult)).toMatchObject({
          username,
          role: 'admin',
          active: true,
        });
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'selects stored keys and synchronizes profile changes without changing account identity',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const clients = yield* AuthClientMap;
        const server = yield* setupTestServerWithUsers({ userCount: 2 });
        const [first, second] = yield* signInTestServerUsers(manager, server);
        yield* manager.setActiveAccount(first.key);
        const state2 = yield* manager.state;
        expect(state2).toEqual(Option.some(first.key));
        const client = yield* clients.acquire(first.key);
        yield* client.sessionChanges.pipe(
          Stream.filter(
            (state) => AsyncResult.isSuccess(state) && !state.waiting && Option.isSome(state.value)
          ),
          Stream.runHead
        );
        const changed = yield* repository.list.pipe(
          Reactivity.stream(['account']),
          Stream.filter((accounts) =>
            Array.some(accounts, (account) => account.name === 'Updated Admin')
          ),
          Stream.runHead,
          Effect.forkChild
        );
        yield* client.updateUser({ name: 'Updated Admin' });
        yield* Fiber.join(changed);
        const state3 = yield* manager.state;
        expect(state3).toEqual(Option.some(first.key));
        const findByKeyResult = yield* repository.findByKey(first.key);
        expect(Option.getOrThrow(findByKeyResult)).toMatchObject({
          key: first.key,
          name: 'Updated Admin',
        });
        yield* manager.setActiveAccount(second.key);
        const state4 = yield* manager.state;
        expect(state4).toEqual(Option.some(second.key));
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'removes the captured account and its credentials even while the server is offline',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const scope = yield* Effect.scope;
        const serverScope = yield* Scope.fork(scope);
        const server = yield* setupTestServerWithUsers({ userCount: 2 }).pipe(
          Scope.provide(serverScope)
        );
        const [first, second] = yield* signInTestServerUsers(manager, server);
        yield* Scope.close(serverScope, Exit.void);
        yield* manager.removeAccount(first.key);
        const findByKeyResult = yield* repository.findByKey(first.key);
        expect(findByKeyResult).toEqual(Option.none());
        const readAuthStorageResult = yield* repository.readAuthStorage(first.key);
        expect(readAuthStorageResult).toEqual({});
        const state = yield* manager.state;
        expect(state).toEqual(Option.some(second.key));
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'revokes sessions before deleting the local account',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const server = yield* setupTestServerWithUsers({ userCount: 1 });
        const [account] = yield* signInTestServerUsers(manager, server);
        yield* manager.signOutEverywhere(account.key);
        const list = yield* repository.list;
        expect(list).toEqual([]);
        const state = yield* manager.state;
        expect(state).toEqual(Option.none());
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );

  iit.effect(
    'keeps the local account and credentials when session revocation fails',
    Effect.fnUntraced(
      function* () {
        const manager = yield* AccountManager;
        const repository = yield* AccountRepository;
        const scope = yield* Effect.scope;
        const serverScope = yield* Scope.fork(scope);
        const server = yield* setupTestServerWithUsers({ userCount: 1 }).pipe(
          Scope.provide(serverScope)
        );
        const [account] = yield* signInTestServerUsers(manager, server);
        const credentials = yield* repository.readAuthStorage(account.key);
        yield* Scope.close(serverScope, Exit.void);
        const signOutEverywhereError = yield* manager
          .signOutEverywhere(account.key)
          .pipe(Effect.flip);
        expect(signOutEverywhereError).toMatchObject({
          _tag: 'AuthError',
        });
        const findByKeyResult = yield* repository.findByKey(account.key);
        expect(Option.getOrThrow(findByKeyResult)).toMatchObject({
          key: account.key,
          active: true,
        });
        const readAuthStorageResult = yield* repository.readAuthStorage(account.key);
        expect(readAuthStorageResult).toEqual(credentials);
      },
      (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
    )
  );
});
