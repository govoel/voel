import { Context, Data, Effect, Layer, Option, Random, Redacted, Schema, Stream } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import { AuthError } from '@repo/auth-api/shared.ts';

import { AccountRepository } from '#src/services/accounts/repository.ts';
import type { AccountKey, AccountUpsert } from '#src/services/accounts/repository.ts';
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

export class UuidGenerator extends Context.Service<UuidGenerator>()(
  'voel/services/accounts/UuidGenerator',
  {
    make: Effect.gen(function* () {
      const { randomUUID } = yield* Effect.promise(async () => import('expo-crypto'));
      return { v4: Effect.sync(() => randomUUID()) };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);

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
  Pick<Account, 'serverUrl' | 'userId' | 'authStorageId'>
> {}

const activeAccountKeyFromAccount = (
  account: Pick<Account, 'serverUrl' | 'userId' | 'authStorageId'>
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
      const accountRepository = yield* AccountRepository;
      const uuidGenerator = yield* UuidGenerator;
      const xxHash = yield* XxHash;
      const authClientStorageService = yield* AuthClientStorage;
      const authClientMap = yield* AuthClientMap;
      const reactivity = yield* Reactivity.Reactivity;

      const state = accountRepository.getActive().pipe(
        Effect.map(Option.map(activeAccountKeyFromAccount)),
        Effect.catchTags({
          SchemaError: () => AccountDatabaseError.make(),
          SqlError: () => AccountDatabaseError.make(),
        })
      );
      const changes = reactivity.stream(['account'], state).pipe(Stream.changes);

      const setActiveAccount = Effect.fnUntraced(function* ({ serverUrl, userId }: AccountKey) {
        yield* db
          .withTransaction(
            Effect.gen(function* () {
              yield* accountRepository.deactivateAll();
              const persistedAccount = yield* accountRepository.activate({ serverUrl, userId });
              if (Option.isNone(persistedAccount)) {
                return yield* AccountNotFoundError.make({ serverUrl, userId });
              }

              return persistedAccount.value;
            })
          )
          .pipe(
            (effect) => reactivity.mutation(['account'], effect),
            Effect.catchTags({
              SchemaError: () => AccountDatabaseError.make(),
              SqlError: () => AccountDatabaseError.make(),
            })
          );
      });

      const upsertAccount = Effect.fnUntraced(function* ({
        account,
      }: {
        readonly account: Omit<AccountUpsert, 'active'>;
      }) {
        yield* db
          .withTransaction(
            Effect.gen(function* () {
              yield* accountRepository.deactivateAll();

              const persistedAccount = yield* accountRepository.upsert({
                ...account,
                active: true,
              });

              return persistedAccount;
            })
          )
          .pipe(
            (effect) => reactivity.mutation(['account'], effect),
            Effect.catchTags({
              NoSuchElementError: () => AccountDatabaseError.make(),
              SchemaError: () => AccountDatabaseError.make(),
              SqlError: () => AccountDatabaseError.make(),
            })
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

        yield* accountRepository.remove(activeAccount.value).pipe(
          (effect) => reactivity.mutation(['account'], effect),
          Effect.catchTags({
            SchemaError: () => AccountDatabaseError.make(),
            SqlError: () => AccountDatabaseError.make(),
          })
        );
      });

      const signInAccount = Effect.fnUntraced(
        function* ({
          serverUrl,
          username,
          password,
        }: Pick<Account, 'serverUrl' | 'username'> & {
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
        }: Pick<Account, 'serverUrl' | 'username'> &
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
        AccountRepository.layer,
        AuthClientStorage.layer,
        MainDatabase.layer,
        Reactivity.layer,
        UuidGenerator.layer,
        XxHash.layer
      )
    )
  );
}
