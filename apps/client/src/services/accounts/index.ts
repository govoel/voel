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
import { Account } from '#src/services/database/main/schema.ts';
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

      const initializeActiveAccountState = Effect.fnUntraced(function* ({
        activeAccount,
        existingAuthClient,
      }: {
        activeAccount: Option.Option<Selectable<AccountTable>>;
        existingAuthClient: Option.Option<Effect.Success<ReturnType<typeof createVoelAuthClient>>>;
      }) {
        if (Option.isNone(activeAccount)) {
          return Option.none();
        }

        const scope = yield* Scope.fork(serviceScope);
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

        return Option.some({
          account: activeAccount.value,
          state: { authClient, scope },
        });
      });

      const stateRef = yield* db
        .executeTakeFirstOption(
          db
            .selectFrom('account')
            .where('account.active', '=', Account.fields.active.make(1))
            .selectAll()
        )
        .pipe(
          Effect.flatMap((activeAccount) =>
            initializeActiveAccountState({ activeAccount, existingAuthClient: Option.none() })
          ),
          Effect.flatMap(SubscriptionRef.make)
        );

      const setActiveAccount = ({
        serverUrl,
        username,
        authClient,
      }: Pick<Insertable<AccountTable>, 'serverUrl' | 'username'> & {
        authClient: Option.Option<Effect.Success<ReturnType<typeof createVoelAuthClient>>>;
      }) =>
        SubscriptionRef.modifySomeEffect(
          stateRef,
          Effect.fnUntraced(function* (state) {
            if (
              Option.isSome(state) &&
              state.value.account.serverUrl === serverUrl &&
              state.value.account.username === username
            ) {
              return [void 0, Option.none()] as const;
            }

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

                  return yield* trx.executeTakeFirstOption(
                    trx
                      .insertInto('account')
                      .values({ serverUrl, username, active: Account.fields.active.make(1) })
                      .onConflict((oc) =>
                        oc.columns(['serverUrl', 'username']).doUpdateSet({ active: 1 })
                      )
                      .returningAll()
                  );
                })
              )
              .pipe(Reactivity.mutation(['account']));

            if (Option.isSome(state)) {
              yield* Scope.close(state.value.state.scope, Exit.void);
            }

            return [
              void 0,
              yield* initializeActiveAccountState({
                activeAccount,
                existingAuthClient: authClient,
              }).pipe(Effect.map(Option.some)),
            ] as const;
          })
        );

      const removeAccount = ({
        serverUrl,
        username,
      }: Pick<Selectable<AccountTable>, 'serverUrl' | 'username'>) =>
        SubscriptionRef.modifyEffect(
          stateRef,
          Effect.fnUntraced(function* (state) {
            yield* db
              .execute(
                db
                  .deleteFrom('account')
                  .where('serverUrl', '=', serverUrl)
                  .where('username', '=', username)
              )
              .pipe(Reactivity.mutation(['account']));

            if (
              Option.isSome(state) &&
              state.value.account.serverUrl === serverUrl &&
              state.value.account.username === username
            ) {
              yield* Scope.close(state.value.state.scope, Exit.void);
              return [void 0, Option.none()] as const;
            }

            return [void 0, state] as const;
          })
        );

      const upsertAccount = Effect.fnUntraced(function* ({
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

        return yield* setActiveAccount({
          serverUrl,
          username,
          authClient: Option.some(authClient),
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

        return yield* setActiveAccount({
          serverUrl,
          username,
          authClient: Option.some(authClient),
        });
      });

      return {
        changes: SubscriptionRef.changes(stateRef),
        state: SubscriptionRef.get(stateRef),
        setActiveAccount,
        removeAccount,
        upsertAccount,
        setupServerWithAccount,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}
