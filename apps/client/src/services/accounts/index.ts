import {
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Queue,
  Redacted,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import { uuid } from 'expo-modules-core';

import type { Insertable, Selectable } from '@repo/effect-kysely';

import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account, AccountRole } from '#src/services/database/main/schema.ts';
import type { AccountTable } from '#src/services/database/main/schema.ts';

class BetterAuthOriginalError extends Schema.Class<
  BetterAuthOriginalError,
  { readonly brand: unique symbol }
>('voel/services/accounts/index/BetterAuthOriginalError')({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.Number,
  statusText: Schema.String,
}) {}

export class AccountSignInError extends Schema.TaggedErrorClass<
  AccountSignInError,
  { readonly brand: unique symbol }
>()('voel/services/accounts/index/AccountSignInError', { original: BetterAuthOriginalError }) {}

export class AccountSignUpError extends Schema.TaggedErrorClass<
  AccountSignUpError,
  { readonly brand: unique symbol }
>()('voel/services/accounts/index/AccountSignUpError', { original: BetterAuthOriginalError }) {}

export class AccountDatabaseError extends Schema.TaggedErrorClass<
  AccountDatabaseError,
  { readonly brand: unique symbol }
>()('voel/services/accounts/index/AccountDatabaseError', {}) {}

export class AccountNotFoundError extends Schema.TaggedErrorClass<
  AccountNotFoundError,
  { readonly brand: unique symbol }
>()('voel/services/accounts/index/AccountNotFoundError', {
  serverUrl: Schema.String,
  userId: Schema.String,
}) {}

const originalAuthErrorFromUnknown = (error: unknown) =>
  error instanceof Error
    ? new BetterAuthOriginalError({
        message: error.message,
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      })
    : new BetterAuthOriginalError({
        message: 'An unknown error occurred.',
        status: 0,
        statusText: 'UNKNOWN',
        code: 'UNKNOWN',
      });

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/services/accounts/index/AccountManager',
  {
    make: Effect.gen(function* () {
      const db = yield* MainDatabase;
      const serviceScope = yield* Scope.Scope;

      const runWithAuthClientStorage = yield* Effect.context<AuthClientStorage>().pipe(
        Effect.map(Effect.runSyncWith)
      );

      const authClientStorage = {
        getItem: (key) =>
          runWithAuthClientStorage(
            AuthClientStorage.pipe(
              Effect.flatMap((storage) => storage.getItem(key)),
              Effect.map(Option.getOrNull)
            )
          ),
        setItem: (key, value) => {
          runWithAuthClientStorage(
            AuthClientStorage.pipe(Effect.flatMap((storage) => storage.setItem(key, value)))
          );
        },
      } satisfies Parameters<typeof createVoelAuthClient>[0]['storage'];

      const stateRef = yield* SubscriptionRef.make(
        Option.none<{
          readonly account: Selectable<AccountTable>;
          readonly state: {
            readonly authClient: Effect.Success<ReturnType<typeof createVoelAuthClient>>;
            readonly scope: Scope.Closeable;
          };
        }>()
      );

      const initializeActiveAccountState = ({
        activeAccount,
        existingAuthClient,
      }: {
        readonly activeAccount: Selectable<AccountTable>;
        readonly existingAuthClient: Option.Option<
          Effect.Success<ReturnType<typeof createVoelAuthClient>>
        >;
      }) =>
        SubscriptionRef.modifySomeEffect(
          stateRef,
          Effect.fnUntraced(function* (state) {
            if (
              Option.isSome(state) &&
              state.value.account.serverUrl === activeAccount.serverUrl &&
              state.value.account.userId === activeAccount.userId &&
              Option.match(existingAuthClient, {
                onNone: () => true,
                onSome: (nextAuthClient) => state.value.state.authClient === nextAuthClient,
              })
            ) {
              return [void 0, Option.none()] as const;
            }

            const scope = yield* Scope.fork(serviceScope);
            const authClient = yield* Option.match(existingAuthClient, {
              onSome: Effect.succeed,
              onNone: () =>
                createVoelAuthClient({
                  serverUrl: activeAccount.serverUrl.toString(),
                  authStorageId: activeAccount.authStorageId,
                  storage: authClientStorage,
                }),
            });

            // Subscribe directly rather than through Stream.callback, which acquires lazily:
            // forkIn may return before its callback runs. Account initialization must own the
            // subscription synchronously so an immediate account switch closes it deterministically.
            type SessionState = Parameters<
              Parameters<typeof authClient.useSession.subscribe>[0]
            >[0];
            const sessionStates = yield* Queue.unbounded<SessionState>();

            const synchronizeAccount = Effect.fnUntraced(function* (sessionState: SessionState) {
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

            yield* Stream.fromQueue(sessionStates).pipe(
              Stream.runForEach(synchronizeAccount),
              Effect.forkIn(scope, { startImmediately: true })
            );

            const unsubscribe = authClient.useSession.subscribe((sessionState) => {
              Queue.offerUnsafe(sessionStates, sessionState);
            });
            yield* Scope.addFinalizer(
              scope,
              Effect.all([Effect.sync(unsubscribe), Queue.shutdown(sessionStates)], {
                discard: true,
              })
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
          existingAuthClient: Option.none(),
        });
      }

      const setActiveAccount = Effect.fnUntraced(function* ({
        serverUrl,
        userId,
        authClient,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'userId'> & {
        readonly authClient: Option.Option<Effect.Success<ReturnType<typeof createVoelAuthClient>>>;
      }) {
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
          existingAuthClient: authClient,
        });
      });

      const upsertAccount = Effect.fnUntraced(function* ({
        account,
        authClient,
      }: {
        readonly account: Pick<
          Insertable<AccountTable>,
          'serverUrl' | 'userId' | 'username' | 'authStorageId' | 'role' | 'profilePicture'
        >;
        readonly authClient: Effect.Success<ReturnType<typeof createVoelAuthClient>>;
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
          existingAuthClient: Option.some(authClient),
        });
      });

      const removeAccount = ({
        serverUrl,
        userId,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'userId'>) =>
        SubscriptionRef.modifyEffect(
          stateRef,
          Effect.fnUntraced(function* (state) {
            yield* db
              .execute(
                db
                  .deleteFrom('account')
                  .where('serverUrl', '=', serverUrl)
                  .where('userId', '=', userId)
              )
              .pipe(Reactivity.mutation(['account']));

            if (
              Option.isSome(state) &&
              state.value.account.serverUrl === serverUrl &&
              state.value.account.userId === userId
            ) {
              yield* Scope.close(state.value.state.scope, Exit.void);
              return [void 0, Option.none()] as const;
            }

            return [void 0, state] as const;
          })
        );

      const signInAccount = Effect.fnUntraced(function* ({
        serverUrl,
        username,
        password,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'username'> & {
        password: Redacted.Redacted;
      }) {
        const authStorageId = Account.fields.authStorageId.make(uuid.v4());
        const authClient = yield* createVoelAuthClient({
          serverUrl,
          authStorageId,
          storage: authClientStorage,
        });

        const signInResult = yield* Effect.tryPromise({
          try: async () =>
            authClient.signIn.username({ username, password: Redacted.value(password) }),
          catch: (error) =>
            new AccountSignInError({ original: originalAuthErrorFromUnknown(error) }),
        });

        if (signInResult.error !== null) {
          return yield* new AccountSignInError({
            original: new BetterAuthOriginalError(signInResult.error),
          });
        }

        return yield* upsertAccount({
          account: {
            serverUrl,
            userId: signInResult.data.user.id,
            username: signInResult.data.user.username ?? username,
            authStorageId,
            role: AccountRole.decodeSyncFromNullishString(signInResult.data.user.role).value,
            profilePicture: signInResult.data.user.image ?? null,
          },
          authClient,
        });
      });

      const setupServerWithAccount = Effect.fnUntraced(function* ({
        serverUrl,
        name,
        email,
        username,
        password,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'username'> &
        Pick<
          Parameters<
            Effect.Success<ReturnType<typeof createVoelAuthClient>>['signUp']['email']
          >['0'],
          'name' | 'email'
        > & {
          password: Redacted.Redacted;
        }) {
        const authStorageId = Account.fields.authStorageId.make(uuid.v4());
        const authClient = yield* createVoelAuthClient({
          serverUrl,
          authStorageId,
          storage: authClientStorage,
        });

        const signUpResult = yield* Effect.tryPromise({
          try: async () =>
            authClient.signUp.email({
              name,
              email,
              username,
              password: Redacted.value(password),
            }),
          catch: (error) =>
            new AccountSignUpError({ original: originalAuthErrorFromUnknown(error) }),
        });

        if (signUpResult.error !== null) {
          return yield* new AccountSignUpError({
            original: new BetterAuthOriginalError(signUpResult.error),
          });
        }

        return yield* upsertAccount({
          account: {
            serverUrl,
            userId: signUpResult.data.user.id,
            username: signUpResult.data.user.username ?? username,
            authStorageId,
            role: AccountRole.decodeSyncFromNullishString(signUpResult.data.user.role).value,
            profilePicture: signUpResult.data.user.image ?? null,
          },
          authClient,
        });
      });

      return {
        changes: SubscriptionRef.changes(stateRef),
        state: SubscriptionRef.get(stateRef),
        setActiveAccount,
        removeAccount,
        signInAccount,
        setupServerWithAccount,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
