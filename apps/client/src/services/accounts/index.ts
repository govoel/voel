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
import { SqlClient } from 'effect/unstable/sql';

import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { toDatabaseError } from '#src/services/database/index.ts';
import type { AccountTable } from '#src/services/database/repos/accounts.ts';
import { AccountRepository } from '#src/services/database/repos/accounts.ts';

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
      const accountsRepo = yield* AccountRepository;
      const sql = yield* SqlClient.SqlClient;

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

      const initializeActiveAccountState = Effect.fnUntraced(function* ({
        activeAccount,
        accounts,
        existingAuthClient,
      }: {
        activeAccount: Option.Option<AccountTable>;
        accounts: AccountTable[];
        existingAuthClient: Option.Option<Effect.Success<ReturnType<typeof createVoelAuthClient>>>;
      }) {
        if (Option.isNone(activeAccount)) {
          return { activeAccount: Option.none(), accounts };
        }

        const scope = yield* Scope.make();
        const authClient = yield* Option.match(existingAuthClient, {
          onSome: Effect.succeed,
          onNone: () =>
            createVoelAuthClient({
              serverUrl: activeAccount.value.serverUrl.toString(),
              username: activeAccount.value.username,
              storage: authClientStorage,
            }),
        });

        const unsubscribe = authClient.useSession.subscribe(() => void 0);

        yield* Scope.addFinalizer(scope, Effect.sync(unsubscribe));

        return {
          activeAccount: Option.some({
            account: activeAccount.value,
            state: { authClient, scope },
          }),
          accounts,
        };
      });

      const stateRef = yield* accountsRepo.list().pipe(
        Effect.map((accounts) => ({
          activeAccount: Option.fromNullishOr(accounts.find((account) => account.active)),
          existingAuthClient: Option.none(),
          accounts,
        })),
        Effect.flatMap(initializeActiveAccountState),
        Effect.flatMap(SubscriptionRef.make)
      );

      const setActiveAccount = ({
        serverUrl,
        username,
        authClient,
      }: Pick<Parameters<typeof accountsRepo.upsert>['0'], 'serverUrl' | 'username'> & {
        authClient: Effect.Success<ReturnType<typeof createVoelAuthClient>>;
      }) =>
        SubscriptionRef.modifySomeEffect(
          stateRef,
          Effect.fnUntraced(
            function* (state) {
              if (
                Option.isSome(state.activeAccount) &&
                state.activeAccount.value.account.serverUrl === serverUrl &&
                state.activeAccount.value.account.username === username
              ) {
                return [void 0, Option.none()] as const;
              }

              yield* accountsRepo.clearActive();
              const account = yield* accountsRepo.upsert({
                serverUrl,
                username,
                active: Option.some(true),
              });

              if (Option.isSome(state.activeAccount)) {
                yield* Scope.close(state.activeAccount.value.state.scope, Exit.void);
              }

              return [
                void 0,
                yield* initializeActiveAccountState({
                  activeAccount: Option.some(account),
                  existingAuthClient: Option.some(authClient),
                  accounts: yield* accountsRepo.list(),
                }).pipe(Effect.map(Option.some)),
              ] as const;
            },
            (effect) =>
              effect.pipe(sql.withTransaction, toDatabaseError('AccountManager.setActiveAccount'))
          )
        );

      const removeAccount = ({
        serverUrl,
        username,
      }: Parameters<typeof accountsRepo.remove>['0']) =>
        SubscriptionRef.modifyEffect(
          stateRef,
          Effect.fnUntraced(
            function* (state) {
              yield* accountsRepo.remove({ serverUrl, username });

              if (
                Option.isSome(state.activeAccount) &&
                state.activeAccount.value.account.serverUrl === serverUrl &&
                state.activeAccount.value.account.username === username
              ) {
                yield* Scope.close(state.activeAccount.value.state.scope, Exit.void);
                return [
                  void 0,
                  { activeAccount: Option.none(), accounts: yield* accountsRepo.list() },
                ] as const;
              }

              return [
                void 0,
                {
                  activeAccount: state.activeAccount,
                  accounts: yield* accountsRepo.list(),
                },
              ] as const;
            },
            (effect) =>
              effect.pipe(sql.withTransaction, toDatabaseError('AccountManager.removeAccount'))
          )
        );

      const upsertAccount = Effect.fnUntraced(function* ({
        serverUrl,
        username,
        password,
      }: Pick<Parameters<typeof setActiveAccount>['0'], 'serverUrl' | 'username'> & {
        password: Redacted.Redacted;
      }) {
        const authClient = yield* createVoelAuthClient({
          serverUrl: serverUrl.toString(),
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

        return yield* setActiveAccount({
          serverUrl,
          username,
          authClient,
        }).pipe(toDatabaseError('AccountManager.upsertAccount'));
      });

      const setupServerAccount = Effect.fnUntraced(function* ({
        serverUrl,
        name,
        email,
        username,
        password,
      }: Pick<Parameters<typeof setActiveAccount>['0'], 'serverUrl' | 'username'> &
        Pick<
          Parameters<
            Effect.Success<ReturnType<typeof createVoelAuthClient>>['signUp']['email']
          >['0'],
          'name' | 'email'
        > & {
          password: Redacted.Redacted;
        }) {
        const authClient = yield* createVoelAuthClient({
          serverUrl: serverUrl.toString(),
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

        return yield* setActiveAccount({
          serverUrl,
          username,
          authClient,
        }).pipe(toDatabaseError('AccountManager.setupServerAccount'));
      });

      return {
        changes: SubscriptionRef.changes(stateRef),
        state: SubscriptionRef.get(stateRef),
        setActiveAccount,
        removeAccount,
        upsertAccount,
        setupServerAccount,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(AccountRepository.layer)
  );
}
