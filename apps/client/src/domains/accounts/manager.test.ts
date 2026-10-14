/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { Array, Context, Deferred, Effect, Fiber, Layer, Option, Redacted, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { AsyncResult, Reactivity } from 'effect/reactivity';
import { TestClock } from 'effect/testing';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountNotFoundError, AccountDatabaseError } from '#src/domains/accounts/errors.ts';
import { AccountStorageKey, Account } from '#src/domains/accounts/schema.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { CryptoDigest } from '#src/domains/accounts/auth-client/crypto-digest.ts';
import { AuthClient, AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { AuthClientStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { MainDatabase } from '#src/database/main/index.ts';
import { TestServerControllerClient } from '#src/testing/server-controller/client.ts';
import { makeAuthClient, makeClientTestLayers, makeServerUrl, makeUsername, setupTestServerWithUsers, signInTestServerUsers } from '#src/testing/utils.ts';



const getAccounts = AccountRepository.pipe(Effect.flatMap((repository) => repository.list));

const getActiveAccount = AccountRepository.pipe(
  Effect.flatMap((repository) => repository.getActive)
);

const storedAccount = ({
  userId,
  serverUrl = 'https://stored.example.test',
  username = userId,
  authStorageId = `storage-${userId}`,
  active = false,
}: {
  readonly userId: string;
  readonly serverUrl?: string;
  readonly username?: string;
  readonly authStorageId?: string;
  readonly active?: boolean;
}) =>
  Account.upsert.make({
    serverUrl: Account.fields.serverUrl.make(serverUrl),
    userId: Account.fields.userId.make(userId),
    username: Account.fields.username.make(username),
    name: Account.fields.name.make(`Stored ${userId}`),
    email: Account.fields.email.make(`${userId}@example.test`),
    authStorageId: Account.fields.authStorageId.make(authStorageId),
    role: Account.fields.role.make('user'),
    profilePicture: Account.fields.profilePicture.make(null),
    active,
  });

const seedAccounts = Effect.fnUntraced(function* (
  accounts: ReadonlyArray<typeof Account.upsert.Type>
) {
  const repository = yield* AccountRepository;
  yield* Effect.forEach(accounts, (account) => repository.upsert(account), { discard: true });
});

const withFreshManager = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(Layer.fresh(AccountManager.layerNoDeps)));

const forkActiveAccountChange = Effect.fnUntraced(function* (
  matches: (account: Option.Option<Account>) => boolean
) {
  const accountRepository = yield* AccountRepository;
  const subscribed = yield* Deferred.make<true>();
  const fiber = yield* accountRepository.getActive.pipe(
    Reactivity.stream(['account']),
    Stream.tap(() => Deferred.succeed(subscribed, true)),
    Stream.drop(1),
    Stream.filter(matches),
    Stream.runHead,
    Effect.forkChild
  );
  yield* Deferred.await(subscribed);
  return fiber;
});

const forkNextActiveAccountChange = forkActiveAccountChange(() => true);

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
        const authClients = yield* AuthClientMap;
        const authStorage = {
          serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
          authStorageId: Account.fields.authStorageId.make('auth-storage-id'),
        };
        const activeAccount = AccountStorageKey.make({
          ...authStorage,
          userId: Account.fields.userId.make('user-id'),
        });
        const accountProfile = {
          ...authStorage,
          userId: activeAccount.userId,
          username: Account.fields.username.make('renamed-user'),
        };
        const [firstClient, activeClient, profileClient, otherServerClient, otherSignInClient] =
          yield* Effect.all([
            authClients.acquire(authStorage),
            authClients.acquire(activeAccount),
            authClients.acquire(accountProfile),
            authClients.acquire({
              ...authStorage,
              serverUrl: Account.fields.serverUrl.make('https://other.voel.example.com'),
            }),
            authClients.acquire({
              ...authStorage,
              authStorageId: Account.fields.authStorageId.make('other-auth-storage-id'),
            }),
          ]).pipe(
            // Acquiring through the captured instance does not require the map in caller context.
            Effect.updateContext((context: Context.Context<Scope.Scope>) =>
              Context.omit(AuthClientMap)(context)
            ),
            Effect.scoped
          );

        expect(activeClient).toBe(firstClient);
        expect(profileClient).toBe(firstClient);
        expect(otherServerClient).not.toBe(firstClient);
        expect(otherSignInClient).not.toBe(firstClient);
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
        const accountRepository = yield* AccountRepository;
        const serverUrl = Account.fields.serverUrl.make('http://restored.example.test');
        const userId = Account.fields.userId.make('restored-user-id');
        const username = Account.fields.username.make('restored');
        const authStorageId = Account.fields.authStorageId.make('restored-auth-storage');

        yield* accountRepository.upsertActive({
          serverUrl,
          userId,
          username,
          name: Account.fields.name.make('Restored User'),
          email: Account.fields.email.make('restored@example.test'),
          authStorageId,
          role: Account.fields.role.make('user'),
          profilePicture: Account.fields.profilePicture.make(null),
        });

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

  describe('automatic selection', () => {
    it.effect(
      'restores inactive rows by stable server and user identity, independent of insertion and username order',
      Effect.fnUntraced(
        function* () {
          const laterServer = storedAccount({
            userId: 'a',
            serverUrl: 'https://z.example.test',
            username: 'aaa',
          });
          const laterUser = storedAccount({ userId: 'b', username: 'bbb' });
          const fallback = storedAccount({ userId: 'a', username: 'zzz' });
          yield* seedAccounts([laterServer, laterUser, fallback]);

          for (let lifetime = 0; lifetime < 2; lifetime += 1) {
            yield* Effect.gen(function* () {
              const manager = yield* AccountManager;
              expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(fallback)));
              expect((yield* getAccounts).filter((account) => account.active)).toMatchObject([
                { serverUrl: fallback.serverUrl, userId: fallback.userId },
              ]);
            }).pipe(withFreshManager);
          }
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'preserves the persisted active account even when a fallback sorts first',
      Effect.fnUntraced(
        function* () {
          const fallback = storedAccount({ userId: 'a' });
          const selected = storedAccount({ userId: 'z', active: true });
          yield* seedAccounts([fallback, selected]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            expect(yield* getAccounts).toMatchObject([
              { userId: fallback.userId, active: false },
              { userId: selected.userId, active: true },
            ]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'repairs legacy multiple-active rows deterministically without selecting an inactive row',
      Effect.fnUntraced(
        function* () {
          const sql = yield* MainDatabase;
          yield* sql`
            drop index account_active_uniqueidx
          `;
          const inactive = storedAccount({ userId: 'a' });
          const selected = storedAccount({ userId: 'b', active: true });
          const duplicate = storedAccount({ userId: 'c', active: true });
          yield* seedAccounts([duplicate, inactive, selected]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            expect(yield* getAccounts).toMatchObject([
              { userId: inactive.userId, active: false },
              { userId: selected.userId, active: true },
              { userId: duplicate.userId, active: false },
            ]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'fails manager initialization rather than exposing an empty selection when restoration fails',
      Effect.fnUntraced(
        function* () {
          const sql = yield* MainDatabase;
          yield* sql`
            drop table account
          `;
          const error = yield* AccountManager.make.pipe(Effect.flip);
          expect(error).toEqual(AccountDatabaseError.make());
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'rejects an undecodable restored account and rolls back its activation',
      Effect.fnUntraced(
        function* () {
          yield* seedAccounts([storedAccount({ userId: 'a' })]);
          const sql = yield* MainDatabase;
          yield* sql`
            update account
            set
              "serverUrl" = 'not-a-server-url'
          `;
          const error = yield* AccountManager.make.pipe(Effect.flip);
          expect(error).toEqual(AccountDatabaseError.make());
          expect(
            yield* sql`
              select
                active
              from
                account
            `
          ).toEqual([{ active: 0 }]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'removes the active row with fallback and emits the selected key, then removes the last row to None',
      Effect.fnUntraced(
        function* () {
          const fallback = storedAccount({ userId: 'a' });
          const selected = storedAccount({ userId: 'b', active: true });
          yield* seedAccounts([selected, fallback]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            const subscribed = yield* Deferred.make<true>();
            const change = yield* manager.changes.pipe(
              Stream.tap(() => Deferred.succeed(subscribed, true)),
              Stream.drop(1),
              Stream.runHead,
              Effect.forkChild
            );
            yield* Deferred.await(subscribed);
            yield* manager.removeAccount(AccountStorageKey.make(selected));
            expect(Option.getOrThrow(yield* Fiber.join(change))).toEqual(
              Option.some(AccountStorageKey.make(fallback))
            );
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(fallback)));
            expect(yield* getAccounts).toMatchObject([{ userId: fallback.userId, active: true }]);

            yield* manager.removeAccount(AccountStorageKey.make(selected));
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(fallback)));
            yield* manager.removeAccount(AccountStorageKey.make(fallback));
            yield* manager.removeAccount(AccountStorageKey.make(fallback));
            expect(yield* manager.state).toEqual(Option.none());
            expect(yield* getAccounts).toEqual([]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'preserves the active account when removing an inactive row or an obsolete storage incarnation',
      Effect.fnUntraced(
        function* () {
          const inactive = storedAccount({ userId: 'a' });
          const obsolete = storedAccount({ userId: 'b', authStorageId: 'old-storage' });
          const replacement = storedAccount({ userId: 'b', authStorageId: 'new-storage' });
          const selected = storedAccount({ userId: 'c', active: true });
          yield* seedAccounts([inactive, obsolete, selected]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            yield* seedAccounts([replacement]);
            yield* manager.removeAccount(AccountStorageKey.make(obsolete));
            yield* manager.removeAccount(AccountStorageKey.make(inactive));
            yield* manager.removeAccount(AccountStorageKey.make(inactive));
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            expect(yield* getAccounts).toMatchObject([
              {
                userId: replacement.userId,
                authStorageId: replacement.authStorageId,
                active: false,
              },
              { userId: selected.userId, active: true },
            ]);
            yield* manager.setActiveAccount(replacement);
            yield* manager.removeAccount(AccountStorageKey.make(obsolete));
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(replacement)));
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'rejects an undecodable removal fallback and preserves the selected row and flags',
      Effect.fnUntraced(
        function* () {
          const fallback = storedAccount({ userId: 'a' });
          const selected = storedAccount({ userId: 'b', active: true });
          yield* seedAccounts([fallback, selected]);
          const sql = yield* MainDatabase;
          yield* sql`
            update account
            set
              "serverUrl" = 'not-a-server-url'
            where
              "userId" = 'a'
          `;
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            const error = yield* manager
              .removeAccount(AccountStorageKey.make(selected))
              .pipe(Effect.flip);
            expect(error).toEqual(AccountDatabaseError.make());
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            // The corrupt row cannot be decoded by repository.list(); inspect its persisted flag.
            expect(
              yield* sql`
                select
                  "userId",
                  active
                from
                  account
                order by
                  "userId"
              `
            ).toEqual([
              { userId: 'a', active: 0 },
              { userId: 'b', active: 1 },
            ]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'rolls back deletion when fallback activation fails',
      Effect.fnUntraced(
        function* () {
          const fallback = storedAccount({ userId: 'a' });
          const selected = storedAccount({ userId: 'b', active: true });
          yield* seedAccounts([fallback, selected]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            const sql = yield* MainDatabase;
            yield* sql`
              create trigger reject_fallback before
              update of active on account when new.active = 1
              and new."userId" = 'a' begin
              select
                raise (abort, 'fallback rejected');

              end
            `;
            const error = yield* manager
              .removeAccount(AccountStorageKey.make(selected))
              .pipe(Effect.flip);
            expect(error).toEqual(AccountDatabaseError.make());
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            expect(yield* getAccounts).toMatchObject([
              { userId: fallback.userId, active: false },
              { userId: selected.userId, active: true },
            ]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    it.effect(
      'serializes concurrent removal and selection without losing the remaining selected account',
      Effect.fnUntraced(
        function* () {
          const fallback = storedAccount({ userId: 'a' });
          const removed = storedAccount({ userId: 'b', active: true });
          const selected = storedAccount({ userId: 'c' });
          yield* seedAccounts([fallback, removed, selected]);
          yield* Effect.gen(function* () {
            const manager = yield* AccountManager;
            yield* Effect.all(
              [
                manager.removeAccount(AccountStorageKey.make(removed)),
                manager.setActiveAccount(selected),
                manager.removeAccount(AccountStorageKey.make(removed)),
              ],
              { concurrency: 'unbounded' }
            );
            expect(yield* manager.state).toEqual(Option.some(AccountStorageKey.make(selected)));
            expect(yield* getAccounts).toMatchObject([
              { userId: fallback.userId, active: false },
              { userId: selected.userId, active: true },
            ]);
          }).pipe(withFreshManager);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  class ParsedCookie extends Schema.Class<ParsedCookie, { readonly brand: unique symbol }>(
    'voel/domains/accounts/manager.test/ParsedCookie'
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
          const cryptoDigest = yield* CryptoDigest;
          const storagePrefix = yield* cryptoDigest.sha256({
            input: `voel::auth::${serverUrl}::${persistedAccount.authStorageId}`,
          });
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
            const authClient = yield* AuthClientMap.use((authClients) =>
              authClients.acquire(Option.getOrThrow(activeAccount))
            );
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
              active: true,
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
              active: true,
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
          const authClients = yield* AuthClientMap;
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
          const authClient = yield* authClients.acquire(activeAccountKey);
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
            active: true,
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
              active: true,
            },
          ]);

          const storage = yield* AuthClientStorage;
          const cryptoDigest = yield* CryptoDigest;
          const storagePrefix = yield* cryptoDigest.sha256({
            input: `voel::auth::${serverUrl}::${synchronizedAccount.authStorageId}`,
          });
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
            const restoredAuthClient = yield* authClients.acquire(restoredAccount);
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
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccountKey)
          );
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
      'continues synchronizing later session events after a recoverable repository failure',
      Effect.fnUntraced(function* () {
        const failedSync = yield* Deferred.make<true>();
        const accountRepositoryLayer = Layer.effect(
          AccountRepository,
          Effect.gen(function* () {
            const repository = yield* AccountRepository.make;
            return {
              ...repository,
              updateProfile: (profile: Parameters<typeof repository.updateProfile>[0]) =>
                profile.name === 'Rejected profile'
                  ? Deferred.succeed(failedSync, true).pipe(
                      Effect.andThen(
                        AccountDatabaseError.make({ cause: new Error('Database unavailable') })
                      )
                    )
                  : repository.updateProfile(profile),
            };
          })
        );

        yield* Effect.gen(function* () {
          const manager = yield* AccountManager;
          const repository = yield* AccountRepository;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          yield* signInTestServerUsers(manager, testServer);
          const activeKey = Option.getOrThrow(yield* manager.state);
          const authClient = yield* AuthClientMap.use((clients) => clients.acquire(activeKey));
          yield* waitForSessionRequest(authClient);
          const recoveredProfile = yield* forkActiveAccountChange(
            (account) => Option.isSome(account) && account.value.name === 'Recovered profile'
          );

          yield* authClient.updateUser({ name: 'Rejected profile' });
          yield* Deferred.await(failedSync);
          expect(Option.getOrThrow(yield* repository.getActive)).toMatchObject({
            name: 'Test Admin',
            authStorageId: activeKey.authStorageId,
            active: true,
          });
          expect(yield* manager.state).toEqual(Option.some(activeKey));

          yield* authClient.updateUser({ name: 'Recovered profile' });
          const synchronizedAccount = Option.getOrThrow(
            Option.getOrThrow(yield* Fiber.join(recoveredProfile))
          );
          expect(synchronizedAccount).toMatchObject({
            name: 'Recovered profile',
            userId: activeKey.userId,
            authStorageId: activeKey.authStorageId,
            active: true,
          });
          expect(yield* repository.getByStorageKey(activeKey)).toEqual(
            Option.some(synchronizedAccount)
          );
          expect(yield* manager.state).toEqual(Option.some(activeKey));
        }).pipe(Effect.provide(makeClientTestLayers({ accountRepositoryLayer })));
      })
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
          const authClient = yield* AuthClientMap.use((authClients) =>
            authClients.acquire(activeAccountKey)
          );
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
            role: Account.fields.role.make('admin'),
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
            active: true,
          });
          expect(yield* getAccounts).toMatchObject([
            {
              serverUrl: testServer.serverUrl,
              userId: activeAccountKey.userId,
              username,
              role: 'admin',
              active: true,
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
              active: true,
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
          const authClients = yield* AuthClientMap;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const firstState = Option.getOrThrow(yield* manager.state);
          const firstClient = yield* authClients.acquire(firstState);

          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });
          yield* manager.setActiveAccount({
            serverUrl: testServer.serverUrl,
            userId: account.userId,
          });

          const currentState = Option.getOrThrow(yield* manager.state);
          expect(yield* authClients.acquire(currentState)).toBe(firstClient);
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
              active: false,
            },
            {
              serverUrl: testServer.serverUrl,
              username: secondAccount.username,
              active: true,
            },
          ]);
          const activeAccount = Option.getOrThrow(yield* manager.state);
          expect(
            yield* AuthClientMap.use((authClients) => authClients.acquire(activeAccount))
          ).toBeDefined();
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
              active: true,
            },
            {
              serverUrl: testServer.serverUrl,
              username: secondAccount.username,
              active: false,
            },
          ]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );

    iit.effect(
      'reuses idle auth clients until their idle timeout expires',
      Effect.fnUntraced(
        function* () {
          const authClients = yield* AuthClientMap;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          yield* signInTestServerUsers(manager, testServer);

          const activeAccount = Option.getOrThrow(yield* manager.state);
          const firstClient = yield* authClients.acquire(activeAccount).pipe(Effect.scoped);
          const secondClient = yield* authClients.acquire(activeAccount).pipe(Effect.scoped);

          expect(secondClient).toBe(firstClient);

          yield* TestClock.adjust('5 minutes');
          const reopened = yield* authClients.acquire(activeAccount);
          expect(reopened).not.toBe(firstClient);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  it.layer(TestServerControllerClient.layer)('signOutEverywhere', (iit) => {
    iit.effect(
      'revokes sessions and removes only the captured local sign-in, even after switching accounts',
      Effect.fnUntraced(
        function* () {
          const authClients = yield* AuthClientMap;
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 2 });
          const [first, second] = yield* signInTestServerUsers(manager, testServer);
          const firstKey = AccountStorageKey.make({
            serverUrl: first.serverUrl,
            userId: first.userId,
            authStorageId: first.authStorageId,
          });
          const secondKey = AccountStorageKey.make({
            serverUrl: second.serverUrl,
            userId: second.userId,
            authStorageId: second.authStorageId,
          });
          const firstClient = yield* authClients.acquire(firstKey);
          const secondClient = yield* authClients.acquire(secondKey);
          const storage = yield* AuthClientStorage;
          const cryptoDigest = yield* CryptoDigest;
          const prefix = yield* cryptoDigest.sha256({
            input: `voel::auth::${first.serverUrl}::${first.authStorageId}`,
          });
          expect(Option.isSome(yield* storage.getItem(`${prefix}_cookie`))).toBe(true);

          yield* manager.signOutEverywhere(firstKey);

          expect(yield* manager.state).toEqual(Option.some(secondKey));
          expect(Array.map(yield* getAccounts, (account) => account.userId)).toEqual([
            second.userId,
          ]);
          expect(yield* storage.getItem(`${prefix}_cookie`)).toEqual(Option.none());
          expect(yield* storage.getItem(`${prefix}_session_data`)).toEqual(Option.none());
          yield* firstClient.listSessions.pipe(Effect.flip);
          expect((yield* secondClient.readSession).user.id).toBe(second.userId);

          yield* manager.signOutEverywhere(secondKey);
          expect(yield* manager.state).toEqual(Option.none());
          expect(yield* getAccounts).toEqual([]);
        },
        (effect) => effect.pipe(Effect.provide(makeClientTestLayers()))
      )
    );
  });

  it.layer(TestServerControllerClient.layer)('removeAccount', (iit) => {
    const storageItems = new Map<string, string>();

    iit.effect(
      'revokes the Better Auth session and clears its secure storage',
      Effect.fnUntraced(
        function* () {
          const manager = yield* AccountManager;
          const testServer = yield* setupTestServerWithUsers({ userCount: 1 });
          const [account] = yield* signInTestServerUsers(manager, testServer);
          const storage = yield* AuthClientStorage;
          const cryptoDigest = yield* CryptoDigest;
          const storagePrefix = yield* cryptoDigest.sha256({
            input: `voel::auth::${testServer.serverUrl}::${account.authStorageId}`,
          });
          const storedCookie = yield* storage.getItem(`${storagePrefix}_cookie`);
          expect(Option.isSome(storedCookie)).toBe(true);

          const verificationAuthStorageId = Account.fields.authStorageId.make(
            'removed-account-session-verification'
          );
          const verificationStoragePrefix = yield* cryptoDigest.sha256({
            input: `voel::auth::${testServer.serverUrl}::${verificationAuthStorageId}`,
          });

          yield* Effect.gen(function* () {
            const authClient = yield* AuthClient;
            yield* authClient.refreshSession({ query: { disableCookieCache: true } });
            yield* waitForSessionRequest(authClient);
            const sessionBeforeRemoval = yield* authClient.getSession;
            expect(
              Option.getOrThrow(Option.flatten(AsyncResult.value(sessionBeforeRemoval)))
            ).toMatchObject({
              user: { id: account.userId },
            });

            yield* manager.removeAccount(AccountStorageKey.make(account));

            expect(storageItems.size).toEqual(0);
            yield* authClient.refreshSession({ query: { disableCookieCache: true } });
            yield* waitForSessionRequest(authClient);
            const sessionAfterRemoval = yield* authClient.getSession;
            expect(sessionAfterRemoval).toMatchObject({ _tag: 'Success', waiting: false });
            expect(Option.isNone(Option.flatten(AsyncResult.value(sessionAfterRemoval)))).toBe(
              true
            );
            expect(yield* getAccounts).toEqual([]);
            expect(yield* manager.state).toBe(Option.none());
          }).pipe(
            Effect.provide(
              AuthClient.layerNoDeps({
                serverUrl: testServer.serverUrl,
                authStorageId: verificationAuthStorageId,
              }).pipe(
                Layer.provide(
                  Layer.mergeAll(
                    AuthClientStorage.layerTest(
                      new Map([
                        [`${verificationStoragePrefix}_cookie`, Option.getOrThrow(storedCookie)],
                      ])
                    ),
                    CryptoDigest.layerTest
                  )
                )
              )
            )
          );
        },
        (effect) =>
          effect.pipe(
            Effect.scoped,
            Effect.provide(makeClientTestLayers({ authClientStorageMap: storageItems }))
          )
      )
    );
  });
});
