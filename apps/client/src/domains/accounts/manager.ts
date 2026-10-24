import { Context, Effect, Layer, Random, Redacted, Stream } from 'effect';
import { Reactivity } from 'effect/reactivity';

import { CryptoDigest } from '#src/domains/accounts/auth-client/crypto-digest.ts';
import { AuthClientMap, makeAuthStorageKey } from '#src/domains/accounts/auth-client/index.ts';
import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import { AuthClientStorage } from '#src/domains/accounts/auth-client/storage.ts';
import { AccountSignInError, AccountSignUpError } from '#src/domains/accounts/errors.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { Account } from '#src/domains/accounts/schema.ts';

export class UuidGenerator extends Context.Service<UuidGenerator>()(
  'voel/domains/accounts/manager/UuidGenerator',
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

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/domains/accounts/manager/AccountManager',
  {
    make: Effect.gen(function* () {
      const accountRepository = yield* AccountRepository;
      const uuidGenerator = yield* UuidGenerator;
      const cryptoDigest = yield* CryptoDigest;
      const authClientStorageService = yield* AuthClientStorage;
      const authClientMap = yield* AuthClientMap;
      const reactivity = yield* Reactivity.Reactivity;

      const state = accountRepository.getActiveKey;
      const changes = reactivity.stream(['account'], state).pipe(Stream.changes);

      const setActiveAccount = (key: AccountKey) =>
        reactivity.mutation(['account'], accountRepository.setActive(key));

      const upsertAccount = ({ account }: { readonly account: typeof Account.upsert.Type }) =>
        reactivity.mutation(['account'], accountRepository.upsertActive(account));

      const removeAccount = Effect.fnUntraced(function* (key: ActiveAccountKey) {
        // we ignore errors here because the server may be offline
        // which causes better-auth to throw
        yield* authClientMap.acquire(key).pipe(
          Effect.flatMap((authClient) => authClient.signOut),
          Effect.ignore,
          Effect.scoped
        );

        // Mimic Better Auth and remove the auth storage items for this account
        const storagePrefix = yield* cryptoDigest.sha256({
          input: makeAuthStorageKey({
            serverUrl: key.serverUrl,
            authStorageId: key.authStorageId,
          }),
        });
        yield* Effect.all(
          [
            authClientStorageService.removeItem(`${storagePrefix}_cookie`),
            authClientStorageService.removeItem(`${storagePrefix}_session_data`),
          ],
          { concurrency: 'unbounded' }
        );

        yield* accountRepository
          .remove(key)
          .pipe((effect) => reactivity.mutation(['account'], effect));
      });

      const signOutEverywhere = Effect.fnUntraced(function* (key: ActiveAccountKey) {
        const client = yield* authClientMap.acquire(key);
        // Keep local credentials if revocation fails so the user can retry.
        yield* client.revokeSessions;
        yield* removeAccount(key);
      }, Effect.scoped);

      const signInAccount = Effect.fnUntraced(function* ({
        serverUrl,
        username,
        password,
      }: Pick<Account, 'serverUrl'> &
        Omit<Parameters<AuthClient['Service']['signIn']['username']>[0], 'password'> & {
          password: Redacted.Redacted;
        }) {
        const authStorageId = Account.fields.authStorageId.make(yield* uuidGenerator.v4);
        const authClient = yield* authClientMap.acquire({ serverUrl, authStorageId });

        const signInResult = yield* authClient.signIn
          .username({ username, password: Redacted.value(password) })
          .pipe(
            Effect.catchTags({
              AuthError: (error) => AccountSignInError.make({ reason: error.reason }),
            })
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
      }, Effect.scoped);

      const setupServerWithAccount = Effect.fnUntraced(function* ({
        serverUrl,
        name,
        email,
        username,
        password,
      }: Pick<Account, 'serverUrl'> &
        Omit<Parameters<AuthClient['Service']['signUp']['email']>[0], 'password'> & {
          password: Redacted.Redacted;
        }) {
        const authStorageId = Account.fields.authStorageId.make(yield* uuidGenerator.v4);
        const authClient = yield* authClientMap.acquire({ serverUrl, authStorageId });

        const signUpResult = yield* authClient.signUp
          .email({
            name,
            email,
            username,
            password: Redacted.value(password),
          })
          .pipe(
            Effect.catchTags({
              AuthError: (error) => AccountSignUpError.make({ reason: error.reason }),
            })
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
      }, Effect.scoped);

      return {
        changes,
        state,
        setActiveAccount,
        removeAccount,
        signOutEverywhere,
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
        Reactivity.layer,
        UuidGenerator.layer,
        CryptoDigest.layer
      )
    )
  );
}
