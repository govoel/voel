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
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { toDatabaseError } from '#src/services/database/index.ts';

const AccountTable = Schema.Struct({
  serverUrl: Schema.URLFromString.pipe(Schema.brand('AccountServerUrl')),
  username: Schema.NonEmptyString.pipe(Schema.brand('AccountUsername')),
  active: Schema.BooleanFromBit.pipe(Schema.brand('AccountActive')),
});
export type AccountTable = typeof AccountTable.Type;

class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/services/accounts/index/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const get = SqlSchema.findOne({
        Request: Schema.Struct({
          serverUrl: AccountTable.fields.serverUrl,
          username: AccountTable.fields.username,
        }),
        Result: AccountTable,
        execute: ({ serverUrl, username }) => sql`
          select serverUrl, username, active
          from account
          where serverUrl = ${serverUrl} and username = ${username}`,
      });

      const list = SqlSchema.findAll({
        Request: Schema.Void,
        Result: AccountTable,
        execute: () =>
          sql`select serverUrl, username, active from account order by serverUrl, username`,
      });

      const upsert = SqlSchema.findOne({
        Request: Schema.Struct({
          serverUrl: AccountTable.fields.serverUrl.schema,
          username: AccountTable.fields.username.schema,
          active: Schema.Option(AccountTable.fields.active.schema),
        }),
        Result: AccountTable,
        execute: (row) => sql`
          insert into account ${sql.insert({ ...row, active: Option.getOrElse(row.active, () => 0) })}
          on conflict (serverUrl, username) do update set active = excluded.active
          returning serverUrl, username, active`,
      });

      const clearActive = SqlSchema.void({
        Request: Schema.Void,
        execute: () => sql`update account set active = 0 where active = 1`,
      });

      const remove = SqlSchema.void({
        Request: Schema.Struct({
          serverUrl: AccountTable.fields.serverUrl,
          username: AccountTable.fields.username,
        }),
        execute: ({ serverUrl, username }) =>
          sql`delete from account where serverUrl = ${serverUrl} and username = ${username}`,
      });

      return {
        get: (request: Parameters<typeof get>['0']) =>
          get(request).pipe(toDatabaseError('AccountRepository.get')),

        list: (request: Parameters<typeof list>['0']) =>
          list(request).pipe(toDatabaseError('AccountRepository.list')),

        upsert: (request: Parameters<typeof upsert>['0']) =>
          upsert(request).pipe(toDatabaseError('AccountRepository.upsert')),

        clearActive: (request: Parameters<typeof clearActive>['0']) =>
          clearActive(request).pipe(toDatabaseError('AccountRepository.clearActive')),

        remove: (request: Parameters<typeof remove>['0']) =>
          remove(request).pipe(toDatabaseError('AccountRepository.remove')),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make);
}

export class AccountSignInError extends Schema.TaggedErrorClass<AccountSignInError>()(
  'voel/services/accounts/index/AccountSignInError',
  {
    original: Schema.Struct({
      code: Schema.optional(Schema.String),
      message: Schema.optional(Schema.String),
      status: Schema.Number,
      statusText: Schema.String,
    }),
  }
) {}

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
      }: {
        serverUrl: AccountTable['serverUrl'];
        username: AccountTable['username'];
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
                  existingAuthClient: Option.none(),
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
      }: {
        serverUrl: AccountTable['serverUrl'];
        username: AccountTable['username'];
      }) =>
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
      }: {
        serverUrl: typeof AccountTable.fields.serverUrl.schema.Type;
        username: typeof AccountTable.fields.username.schema.Type;
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
            new AccountSignInError(
              error instanceof Error
                ? {
                    original: {
                      message: error.message,
                      status: 0,
                      statusText: 'UNKNOWN',
                      code: 'UNKNOWN',
                    },
                  }
                : {
                    original: {
                      message: 'An unknown error occurred.',
                      status: 0,
                      statusText: 'UNKNOWN',
                      code: 'UNKNOWN',
                    },
                  }
            ),
        });

        if (signInResult.error !== null) {
          return yield* new AccountSignInError({ original: signInResult.error });
        }

        return yield* SubscriptionRef.modifySomeEffect(
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
              effect.pipe(sql.withTransaction, toDatabaseError('AccountManager.upsertAccount'))
          )
        );
      });

      return {
        changes: SubscriptionRef.changes(stateRef),
        state: SubscriptionRef.get(stateRef),
        setActiveAccount,
        removeAccount,
        upsertAccount,
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(AccountRepository.layer)
  );
}
