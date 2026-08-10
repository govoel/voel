import {
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Random,
  Redacted,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

import type { Insertable, Selectable } from '@repo/effect-kysely';

import { BetterAuthError } from '#src/services/auth-client/errors.ts';
import { acquireAuthClient, makeAuthStorageKey } from '#src/services/auth-client/index.ts';
import type { AuthClient, AuthClientSessionState } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { XxHash } from '#src/services/auth-client/xxhash.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account, AccountRole } from '#src/services/database/main/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

export class UuidGenerator extends Context.Service<
  UuidGenerator,
  { readonly v4: Effect.Effect<string> }
>()('voel/services/accounts/index/UuidGenerator') {
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
>('voel/services/accounts/index/AccountSignInError')('AccountSignInError', {
  details: BetterAuthError,
}) {}

export class AccountSignUpError extends Schema.TaggedError<
  AccountSignUpError,
  { readonly brand: unique symbol }
>('voel/services/accounts/index/AccountSignUpError')('AccountSignUpError', {
  details: BetterAuthError,
}) {}

export class AccountSignOutError extends Schema.TaggedError<
  AccountSignOutError,
  { readonly brand: unique symbol }
>('voel/services/accounts/index/AccountSignOutError')('AccountSignOutError', {
  details: BetterAuthError,
}) {}

export class AccountDatabaseError extends Schema.TaggedError<
  AccountDatabaseError,
  { readonly brand: unique symbol }
>('voel/services/accounts/index/AccountDatabaseError')('AccountDatabaseError', {}) {}

export class AccountNotFoundError extends Schema.TaggedError<
  AccountNotFoundError,
  { readonly brand: unique symbol }
>('voel/services/accounts/index/AccountNotFoundError')('AccountNotFoundError', {
  serverUrl: Schema.String,
  userId: Schema.String,
}) {}

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/services/accounts/index/AccountManager',
  {
    make: Effect.gen(function* () {
      const db = yield* MainDatabase;
      const serviceScope = yield* Scope.Scope;
      const uuidGenerator = yield* UuidGenerator;
      const xxHash = yield* XxHash;
      const authClientStorageService = yield* AuthClientStorage;

      const stateRef = yield* SubscriptionRef.make(
        Option.none<{
          readonly account: Selectable<AccountTable>;
          readonly state: {
            readonly authClient: AuthClient['Service'];
            readonly scope: Scope.Closeable;
          };
        }>()
      );

      const initializeActiveAccountState = ({
        activeAccount,
      }: {
        readonly activeAccount: Selectable<AccountTable>;
      }) =>
        SubscriptionRef.modifySomeEffect(
          stateRef,
          Effect.fnUntraced(function* (state) {
            if (
              Option.isSome(state) &&
              state.value.account.serverUrl === activeAccount.serverUrl &&
              state.value.account.userId === activeAccount.userId &&
              state.value.account.authStorageId === activeAccount.authStorageId
            ) {
              return [void 0, Option.none()] as const;
            }

            const scope = yield* Scope.fork(serviceScope);
            const authClient = yield* acquireAuthClient(activeAccount).pipe(
              Effect.provideService(Scope.Scope, scope)
            );

            const synchronizeAccount = Effect.fnUntraced(function* (
              sessionState: AuthClientSessionState
            ) {
              if (sessionState.data === null) {
                return;
              }

              const sessionUser = sessionState.data.user;
              yield* SubscriptionRef.modifySomeEffect(
                stateRef,
                Effect.fnUntraced(function* (currentState) {
                  if (
                    Option.isNone(currentState) ||
                    currentState.value.state.authClient !== authClient ||
                    currentState.value.account.userId !== sessionUser.id
                  ) {
                    return [void 0, Option.none()] as const;
                  }

                  const username = sessionUser.username ?? currentState.value.account.username;
                  const role = AccountRole.decodeSyncFromNullishString(sessionUser.role).value;
                  const profilePicture = sessionUser.image ?? null;
                  if (
                    currentState.value.account.username === username &&
                    currentState.value.account.role === role &&
                    currentState.value.account.profilePicture === profilePicture
                  ) {
                    return [void 0, Option.none()] as const;
                  }

                  const persistedAccount = yield* db
                    .executeTakeFirstOption(
                      db
                        .updateTable('account')
                        .set({ username, role, profilePicture })
                        .where('serverUrl', '=', currentState.value.account.serverUrl)
                        .where('userId', '=', currentState.value.account.userId)
                        .returningAll()
                    )
                    .pipe(Reactivity.mutation(['account']));
                  if (Option.isNone(persistedAccount)) {
                    return [void 0, Option.none()] as const;
                  }

                  return [
                    void 0,
                    Option.some(
                      Option.some({
                        account: persistedAccount.value,
                        state: currentState.value.state,
                      })
                    ),
                  ] as const;
                })
              ).pipe(
                Effect.catchCause((cause) =>
                  Effect.logError('Failed to synchronize active account from session', cause)
                )
              );
            });

            yield* authClient.sessionChanges.pipe(
              Stream.runForEach(synchronizeAccount),
              Effect.forkIn(scope, { startImmediately: true })
            );

            if (Option.isSome(state)) {
              yield* Scope.close(state.value.state.scope, Exit.void);
            }

            return [
              void 0,
              Option.some(Option.some({ account: activeAccount, state: { authClient, scope } })),
            ] as const;
          })
        );

      const storedActiveAccount = yield* db.executeTakeFirstOption(
        db
          .selectFrom('account')
          .where('account.active', '=', Account.fields.active.make(1))
          .selectAll()
      );
      if (Option.isSome(storedActiveAccount)) {
        yield* initializeActiveAccountState({
          activeAccount: storedActiveAccount.value,
        });
      }

      const setActiveAccount = Effect.fnUntraced(function* ({
        serverUrl,
        userId,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'userId'>) {
        const activeAccount = yield* db
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
                return yield* new AccountNotFoundError({ serverUrl, userId });
              }

              return persistedAccount.value;
            })
          )
          .pipe(Reactivity.mutation(['account']));

        return yield* initializeActiveAccountState({
          activeAccount,
        });
      });

      const upsertAccount = Effect.fnUntraced(function* ({
        account,
      }: {
        readonly account: Pick<
          Insertable<AccountTable>,
          'serverUrl' | 'userId' | 'username' | 'authStorageId' | 'role' | 'profilePicture'
        >;
      }) {
        const activeAccount = yield* db
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
            Reactivity.mutation(['account']),
            Effect.mapError(() => new AccountDatabaseError())
          );

        return yield* initializeActiveAccountState({
          activeAccount,
        });
      });

      const removeActiveAccount = SubscriptionRef.modifyEffect(
        stateRef,
        Effect.fnUntraced(function* (state) {
          if (Option.isNone(state)) {
            return [void 0, state] as const;
          }

          // we ignore errors here because the server may be offline
          // which causes better-auth to throw
          yield* state.value.state.authClient.signOut().pipe(Effect.ignore);

          // mimick better-auth and remove the auth storage items for this account
          const storagePrefix = yield* xxHash.hash128(
            makeAuthStorageKey({
              serverUrl: state.value.account.serverUrl,
              authStorageId: state.value.account.authStorageId,
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
                .where('serverUrl', '=', state.value.account.serverUrl)
                .where('userId', '=', state.value.account.userId)
            )
            .pipe(
              Reactivity.mutation(['account']),
              Effect.mapError(() => new AccountDatabaseError())
            );

          yield* Scope.close(state.value.state.scope, Exit.void);
          return [void 0, Option.none()] as const;
        })
      );

      const signInAccount = Effect.fnUntraced(function* ({
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
          .pipe(Effect.mapError((error) => new AccountSignInError({ details: error })));

        return yield* upsertAccount({
          account: {
            serverUrl,
            userId: signInResult.user.id,
            username: signInResult.user.username ?? username,
            authStorageId,
            role: AccountRole.decodeSyncFromNullishString(signInResult.user.role).value,
            profilePicture: signInResult.user.image ?? null,
          },
        });
      }, Effect.scoped);

      const setupServerWithAccount = Effect.fnUntraced(function* ({
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
          .pipe(Effect.mapError((error) => new AccountSignUpError({ details: error })));

        return yield* upsertAccount({
          account: {
            serverUrl,
            userId: signUpResult.user.id,
            username: signUpResult.user.username ?? username,
            authStorageId,
            role: AccountRole.decodeSyncFromNullishString(signUpResult.user.role).value,
            profilePicture: signUpResult.user.image ?? null,
          },
        });
      }, Effect.scoped);

      return {
        changes: SubscriptionRef.changes(stateRef),
        state: SubscriptionRef.get(stateRef),
        setActiveAccount,
        removeActiveAccount,
        signInAccount,
        setupServerWithAccount,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
