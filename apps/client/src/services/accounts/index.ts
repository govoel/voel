import { Context, Data, Effect, Layer, Option, Random, Redacted, Schema, Stream } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { AuthError } from '@repo/auth-api/shared.ts';
import type { Insertable, Selectable } from '@repo/effect-kysely';

import {
  AuthClientMap,
  acquireAuthClient,
  makeAuthStorageKey,
} from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

export class UuidGenerator extends Context.Service<
  UuidGenerator,
  { readonly v4: Effect.Effect<string> }
>()('voel/services/accounts/UuidGenerator') {
  public static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const { randomUUID } = yield* Effect.promise(async () => import('expo-crypto'));
      return Layer.succeed(UuidGenerator, {
        v4: Effect.sync(() => randomUUID()),
      });
    })
  );

  public static readonly layerTest = Layer.succeed(this, {
    v4: Effect.all([Random.nextInt, Random.nextInt]).pipe(
      Effect.map(([left, right]) => `test-${Math.abs(left)}-${Math.abs(right)}`)
    ),
  });
}

export class AccountSignInError extends Schema.TaggedError<
  AccountSignInError,
  { readonly brand: unique symbol }
>('voel/services/accounts/AccountSignInError')('AccountSignInError', {
  reason: AuthError.fields.reason,
}) {}

export class AccountSignUpError extends Schema.TaggedError<
  AccountSignUpError,
  { readonly brand: unique symbol }
>('voel/services/accounts/AccountSignUpError')('AccountSignUpError', {
  reason: AuthError.fields.reason,
}) {}

export class AccountDatabaseError extends Schema.TaggedError<
  AccountDatabaseError,
  { readonly brand: unique symbol }
>('voel/services/accounts/AccountDatabaseError')('AccountDatabaseError', {}) {}

export class AccountNotFoundError extends Schema.TaggedError<
  AccountNotFoundError,
  { readonly brand: unique symbol }
>('voel/services/accounts/AccountNotFoundError')('AccountNotFoundError', {
  serverUrl: Schema.String,
  userId: Schema.String,
}) {}

export class NoActiveAccountError extends Schema.TaggedError<
  NoActiveAccountError,
  { readonly brand: unique symbol }
>('voel/services/accounts/NoActiveAccountError')('NoActiveAccountError', {}) {}

export class ActiveAccountKey extends Data.Class<
  Pick<Selectable<AccountTable>, 'serverUrl' | 'userId' | 'authStorageId'>
> {}

const activeAccountKeyFromAccount = (
  account: Pick<Selectable<AccountTable>, 'serverUrl' | 'userId' | 'authStorageId'>
) =>
  new ActiveAccountKey({
    serverUrl: account.serverUrl,
    userId: account.userId,
    authStorageId: account.authStorageId,
  });

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/services/accounts/AccountManager',
  {
    make: Effect.gen(function* () {
      const db = yield* MainDatabase;
      const uuidGenerator = yield* UuidGenerator;
      const xxHash = yield* XxHash;
      const authClientStorageService = yield* AuthClientStorage;
      const authClientMap = yield* AuthClientMap;
      const reactivity = yield* Reactivity.Reactivity;

      const state = db
        .executeTakeFirstOption(
          db
            .selectFrom('account')
            .where('account.active', '=', Account.fields.active.make(1))
            .selectAll()
        )
        .pipe(
          Effect.map(Option.map(activeAccountKeyFromAccount)),
          Effect.catchTag('DatabaseSqlError', () => AccountDatabaseError.make())
        );
      const changes = reactivity.stream(['account'], state).pipe(Stream.changes);

      const setActiveAccount = Effect.fnUntraced(function* ({
        serverUrl,
        userId,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'userId'>) {
        yield* db
          .trx()
          .execute(
            Effect.fnUntraced(function* (trx) {
              yield* trx.execute(
                trx
                  .updateTable('account')
                  .set({ active: Account.fields.active.make(0) })
                  .where('active', '=', Account.fields.active.make(1))
              );

              const persistedAccount = yield* trx.executeTakeFirstOption(
                trx
                  .updateTable('account')
                  .set({ active: Account.fields.active.make(1) })
                  .where('serverUrl', '=', serverUrl)
                  .where('userId', '=', userId)
                  .returningAll()
              );
              if (Option.isNone(persistedAccount)) {
                return yield* AccountNotFoundError.make({ serverUrl, userId });
              }

              return persistedAccount.value;
            })
          )
          .pipe(
            (effect) => reactivity.mutation(['account'], effect),
            Effect.catchTag('DatabaseSqlError', () => AccountDatabaseError.make())
          );
      });

      const upsertAccount = Effect.fnUntraced(function* ({
        account,
      }: {
        readonly account: Pick<
          Insertable<AccountTable>,
          | 'serverUrl'
          | 'userId'
          | 'username'
          | 'name'
          | 'email'
          | 'authStorageId'
          | 'role'
          | 'profilePicture'
        >;
      }) {
        yield* db
          .trx()
          .execute(
            Effect.fnUntraced(function* (trx) {
              const persistedAccount = yield* trx.executeTakeFirstOrError(
                trx
                  .insertInto('account')
                  .values({ ...account, active: Account.fields.active.make(1) })
                  .onConflict((oc) =>
                    oc.columns(['serverUrl', 'userId']).doUpdateSet({
                      username: account.username,
                      name: account.name,
                      email: account.email,
                      authStorageId: account.authStorageId,
                      role: account.role,
                      profilePicture: account.profilePicture,
                      active: Account.fields.active.make(1),
                    })
                  )
                  .returningAll()
              );

              yield* trx.execute(
                trx
                  .updateTable('account')
                  .set({ active: Account.fields.active.make(0) })
                  .where('active', '=', Account.fields.active.make(1))
                  .where((eb) =>
                    eb.or([
                      eb('serverUrl', '!=', persistedAccount.serverUrl),
                      eb('userId', '!=', persistedAccount.userId),
                    ])
                  )
              );

              return persistedAccount;
            })
          )
          .pipe(
            (effect) => reactivity.mutation(['account'], effect),
            Effect.catchTag(['DatabaseSqlError', 'DatabaseNoSuchElementError'], () =>
              AccountDatabaseError.make()
            )
          );
      });

      const removeActiveAccount = Effect.gen(function* () {
        const activeAccount = yield* state;
        if (Option.isNone(activeAccount)) {
          return;
        }

        // we ignore errors here because the server may be offline
        // which causes better-auth to throw
        yield* acquireAuthClient(activeAccount.value).pipe(
          Effect.flatMap((authClient) => authClient.signOut()),
          Effect.ignore,
          Effect.scoped,
          Effect.provideService(AuthClientMap, authClientMap)
        );

        // mimick better-auth and remove the auth storage items for this account
        const storagePrefix = yield* xxHash.hash128(
          makeAuthStorageKey({
            serverUrl: activeAccount.value.serverUrl,
            authStorageId: activeAccount.value.authStorageId,
          })
        );
        yield* Effect.all(
          [
            authClientStorageService.removeItem(`${storagePrefix}_cookie`),
            authClientStorageService.removeItem(`${storagePrefix}_session_data`),
          ],
          { concurrency: 'unbounded' }
        );

        yield* db
          .execute(
            db
              .deleteFrom('account')
              .where('serverUrl', '=', activeAccount.value.serverUrl)
              .where('userId', '=', activeAccount.value.userId)
          )
          .pipe(
            (effect) => reactivity.mutation(['account'], effect),
            Effect.catchTag('DatabaseSqlError', () => AccountDatabaseError.make())
          );
      });

      const signInAccount = Effect.fnUntraced(
        function* ({
          serverUrl,
          username,
          password,
        }: Pick<Selectable<AccountTable>, 'serverUrl' | 'username'> & {
          password: Redacted.Redacted;
        }) {
          const authStorageId = Account.fields.authStorageId.make(yield* uuidGenerator.v4);
          const authClient = yield* acquireAuthClient({ serverUrl, authStorageId });

          const signInResult = yield* authClient.signIn
            .username({ username, password: Redacted.value(password) })
            .pipe(
              Effect.catchTag('AuthError', (error) =>
                AccountSignInError.make({ reason: error.reason })
              )
            );

          return yield* upsertAccount({
            account: {
              serverUrl,
              userId: signInResult.user.id,
              username: signInResult.user.username,
              name: signInResult.user.name,
              email: signInResult.user.email,
              authStorageId,
              role: signInResult.user.role,
              profilePicture: signInResult.user.image,
            },
          });
        },
        Effect.scoped,
        Effect.provideService(AuthClientMap, authClientMap)
      );

      const setupServerWithAccount = Effect.fnUntraced(
        function* ({
          serverUrl,
          name,
          email,
          username,
          password,
        }: Pick<Selectable<AccountTable>, 'serverUrl' | 'username'> &
          Pick<Parameters<AuthClient['Service']['signUp']['email']>[0], 'name' | 'email'> & {
            password: Redacted.Redacted;
          }) {
          const authStorageId = Account.fields.authStorageId.make(yield* uuidGenerator.v4);
          const authClient = yield* acquireAuthClient({ serverUrl, authStorageId });

          const signUpResult = yield* authClient.signUp
            .email({
              name,
              email,
              username,
              password: Redacted.value(password),
            })
            .pipe(
              Effect.catchTag('AuthError', (error) =>
                AccountSignUpError.make({ reason: error.reason })
              )
            );

          return yield* upsertAccount({
            account: {
              serverUrl,
              userId: signUpResult.user.id,
              username: signUpResult.user.username,
              name: signUpResult.user.name,
              email: signUpResult.user.email,
              authStorageId,
              role: signUpResult.user.role,
              profilePicture: signUpResult.user.image,
            },
          });
        },
        Effect.scoped,
        Effect.provideService(AuthClientMap, authClientMap)
      );

      return {
        changes,
        state,
        setActiveAccount,
        removeActiveAccount,
        signInAccount,
        setupServerWithAccount,
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(
      Layer.mergeAll(
        AuthClientMap.layer,
        AuthClientStorage.layer,
        MainDatabase.layer,
        Reactivity.layer,
        UuidGenerator.layer,
        XxHash.layer
      )
    )
  );
}
