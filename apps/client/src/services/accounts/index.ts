import { Context, Effect, Exit, Layer, Option, Schema, Scope, SubscriptionRef } from 'effect';
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { createVoelAuthClient } from '#src/services/auth-client/index.ts';
import { AuthClientStorage } from '#src/services/auth-client/storage.ts';
import { toDatabaseError } from '#src/services/database/index.ts';

const AccountTable = Schema.Struct({
  serverUrl: Schema.String.pipe(Schema.brand('AccountServerUrl')),
  username: Schema.String.pipe(Schema.brand('AccountUsername')),
  active: Schema.BooleanFromBit.pipe(Schema.brand('AccountActive')),
});
export type AccountTable = typeof AccountTable.Type;

class AccountNotFoundError extends Schema.TaggedErrorClass<AccountNotFoundError>()(
  'voel/services/accounts/index/AccountNotFoundError',
  { serverUrl: AccountTable.fields.serverUrl, username: AccountTable.fields.username }
) {}

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
          serverUrl: AccountTable.fields.serverUrl,
          username: AccountTable.fields.username,
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

export class AccountManager extends Context.Service<AccountManager>()(
  'voel/services/accounts/index/AccountManager',
  {
    make: Effect.gen(function* () {
      const accountsRepo = yield* AccountRepository;
      const sql = yield* SqlClient.SqlClient;

      const runWithAuthClientStorage = yield* Effect.context<AuthClientStorage>().pipe(
        Effect.map(Effect.runSyncWith)
      );

      const initializeActiveAccountState = Effect.fnUntraced(function* ({
        activeAccount,
        accounts,
      }: {
        activeAccount: Option.Option<AccountTable>;
        accounts: AccountTable[];
      }) {
        if (Option.isNone(activeAccount)) {
          return { activeAccount: Option.none(), accounts };
        }

        const scope = yield* Scope.make();
        const authClient = createVoelAuthClient({
          serverUrl: activeAccount.value.serverUrl,
          username: activeAccount.value.username,
          storage: {
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
          },
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

              const account = yield* accountsRepo
                .get({ serverUrl, username })
                .pipe(
                  Effect.catchTag(
                    'voel/services/database/ClientDatabaseNoSuchElementError',
                    () => new AccountNotFoundError({ serverUrl, username })
                  )
                );

              yield* accountsRepo.clearActive();
              yield* accountsRepo.upsert({ serverUrl, username, active: Option.some(true) });

              if (Option.isSome(state.activeAccount)) {
                yield* Scope.close(state.activeAccount.value.state.scope, Exit.void);
              }

              return [
                void 0,
                yield* initializeActiveAccountState({
                  activeAccount: Option.some(account),
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

      const upsertAccount = ({
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
                  accounts: yield* accountsRepo.list(),
                }).pipe(Effect.map(Option.some)),
              ] as const;
            },
            (effect) =>
              effect.pipe(sql.withTransaction, toDatabaseError('AccountManager.upsertAccount'))
          )
        );

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
