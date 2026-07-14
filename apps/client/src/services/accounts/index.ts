import {
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';

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
                  username: activeAccount.username,
                  storage: authClientStorage,
                }),
            });
            const unsubscribe = authClient.useSession.subscribe(() => void 0);
            yield* Scope.addFinalizer(scope, Effect.sync(unsubscribe));

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
          'serverUrl' | 'userId' | 'username' | 'role' | 'profilePicture'
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
        const authClient = yield* createVoelAuthClient({
          serverUrl,
          username,
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
        const authClient = yield* createVoelAuthClient({
          serverUrl,
          username,
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
