import {
  Context,
  Effect,
  Equal,
  Exit,
  Layer,
  Option,
  Schema,
  Scope,
  SubscriptionRef,
} from 'effect';
import type { Stream } from 'effect';
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { createVoelAuthClient } from '#src/services/auth-client.ts';
import type {
  ClientDatabaseDecodeError,
  ClientDatabaseSqlError,
} from '#src/services/database/index.ts';
import { DatabaseLive, toDatabaseError } from '#src/services/database/index.ts';
import * as ServerUrl from '#src/services/server-url.ts';

export const AccountUsername = Schema.NonEmptyString.pipe(Schema.brand('AccountUsername'));
export type AccountUsername = typeof AccountUsername.Type;

export const AccountId = Schema.String.pipe(Schema.brand('AccountId'));
export type AccountId = typeof AccountId.Type;

export const AccountInput = Schema.Struct({
  serverUrl: ServerUrl.ServerUrl,
  username: AccountUsername,
});
export type AccountInput = typeof AccountInput.Type;

export const Account = Schema.Struct({
  ...AccountInput.fields,
  id: AccountId,
});
export type Account = typeof Account.Type;

type AccountDatabaseError = ClientDatabaseDecodeError | ClientDatabaseSqlError;

export class AccountNotFoundError extends Schema.TaggedErrorClass<AccountNotFoundError>()(
  'voel/services/accounts/AccountNotFoundError',
  { accountId: AccountId }
) {}

export interface AccountRuntimeState {
  readonly authClient: ReturnType<typeof createVoelAuthClient>;
  readonly scope: Scope.Scope;
}

export interface AccountSnapshot {
  readonly activeAccount: Option.Option<{
    readonly data: Account;
    readonly state: AccountRuntimeState;
  }>;
  readonly accounts: readonly Account[];
}

const makeAccountId = (account: AccountInput): AccountId =>
  Schema.decodeSync(AccountId)(
    `${encodeURIComponent(ServerUrl.encodeSync(account.serverUrl))}:${encodeURIComponent(account.username)}`
  );

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  serverUrl: Schema.decodeSync(ServerUrl.ServerUrl)(row.serverUrl),
  username: row.username,
});

const makeRuntimeState = Effect.fnUntraced(function* (account: Account) {
  const scope = yield* Scope.make();

  return {
    authClient: createVoelAuthClient({ serverUrl: account.serverUrl, username: account.username }),
    scope,
  } satisfies AccountRuntimeState;
});

const rowSchema = Schema.Struct({
  id: AccountId,
  serverUrl: Schema.String,
  username: AccountUsername,
  active: Schema.Int,
});
type AccountRow = typeof rowSchema.Type;

export class AccountManager extends Context.Service<
  AccountManager,
  {
    readonly changes: Stream.Stream<AccountSnapshot>;
    readonly removeAccount: (
      accountId: AccountId
    ) => Effect.Effect<void, AccountDatabaseError | AccountNotFoundError>;
    readonly setActiveAccount: (
      accountId: AccountId
    ) => Effect.Effect<void, AccountDatabaseError | AccountNotFoundError>;
    readonly upsertAccount: (account: AccountInput) => Effect.Effect<Account, AccountDatabaseError>;
  }
>()('voel/services/accounts/AccountManager') {
  public static readonly make = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const listRows = SqlSchema.findAll({
      Request: Schema.Void,
      Result: rowSchema,
      execute: () =>
        sql`select id, serverUrl, username, active from clientAccount order by serverUrl, username`,
    });

    const findRow = SqlSchema.findOne({
      Request: Schema.Struct({ id: AccountId }),
      Result: rowSchema,
      execute: ({ id }) =>
        sql`select id, serverUrl, username, active from clientAccount where id = ${id}`,
    });

    const upsertRow = SqlSchema.findOne({
      Request: Schema.Struct({
        id: AccountId,
        serverUrl: Schema.String,
        username: AccountUsername,
      }),
      Result: rowSchema,
      execute: (row) => sql`
        insert into clientAccount ${sql.insert({ ...row, active: 0 })}
        on conflict (id) do update set serverUrl = excluded.serverUrl, username = excluded.username
        returning id, serverUrl, username, active`,
    });

    const clearActive = SqlSchema.void({
      Request: Schema.Void,
      execute: () => sql`update clientAccount set active = 0 where active = 1`,
    });

    const activateRow = SqlSchema.void({
      Request: Schema.Struct({ id: AccountId }),
      execute: ({ id }) => sql`update clientAccount set active = 1 where id = ${id}`,
    });

    const deleteRow = SqlSchema.void({
      Request: Schema.Struct({ id: AccountId }),
      execute: ({ id }) => sql`delete from clientAccount where id = ${id}`,
    });

    const loadSnapshot = Effect.fnUntraced(function* (previous: Option.Option<AccountSnapshot>) {
      const rows = yield* listRows().pipe(toDatabaseError('AccountManager.loadSnapshot'));
      const accounts = rows.map(toAccount);
      const activeRow = rows.find((row) => row.active === 1);
      const activeAccount =
        activeRow === void 0 ? Option.none<Account>() : Option.some(toAccount(activeRow));

      const previousActive = Option.match(previous, {
        onNone: () =>
          Option.none<{ readonly data: Account; readonly state: AccountRuntimeState }>(),
        onSome: (snapshot) => snapshot.activeAccount,
      });
      if (
        Option.isSome(previousActive) &&
        (Option.isNone(activeAccount) ||
          !Equal.equals(previousActive.value.data.id, activeAccount.value.id))
      ) {
        yield* Scope.close(previousActive.value.state.scope, Exit.succeed(void 0));
      }

      return {
        accounts,
        activeAccount: Option.isSome(activeAccount)
          ? Option.some(
              Option.isSome(previousActive) &&
                Equal.equals(previousActive.value.data.id, activeAccount.value.id)
                ? { data: activeAccount.value, state: previousActive.value.state }
                : {
                    data: activeAccount.value,
                    state: yield* makeRuntimeState(activeAccount.value),
                  }
            )
          : Option.none<{ readonly data: Account; readonly state: AccountRuntimeState }>(),
      } satisfies AccountSnapshot;
    });

    const initialSnapshot = yield* loadSnapshot(Option.none());
    const ref = yield* SubscriptionRef.make<AccountSnapshot>(initialSnapshot);

    yield* Effect.addFinalizer(() =>
      SubscriptionRef.get(ref).pipe(
        Effect.flatMap((snapshot) =>
          Option.match(snapshot.activeAccount, {
            onNone: () => Effect.void,
            onSome: ({ state }) => Scope.close(state.scope, Exit.succeed(void 0)),
          })
        )
      )
    );

    const refresh = Effect.fnUntraced(function* () {
      const previous = yield* SubscriptionRef.get(ref);
      const next = yield* loadSnapshot(Option.some(previous));
      yield* SubscriptionRef.set(ref, next);
    });

    const ensureExists = (accountId: AccountId) =>
      findRow({ id: accountId }).pipe(
        Effect.catchTag('NoSuchElementError', () =>
          Effect.fail(new AccountNotFoundError({ accountId }))
        ),
        toDatabaseError('AccountManager.ensureExists')
      );

    return AccountManager.of({
      changes: SubscriptionRef.changes(ref),

      removeAccount: Effect.fn('AccountManager.removeAccount')(function* (accountId) {
        yield* ensureExists(accountId);
        yield* deleteRow({ id: accountId }).pipe(toDatabaseError('AccountManager.removeAccount'));
        yield* refresh();
      }),

      setActiveAccount: Effect.fn('AccountManager.setActiveAccount')(function* (accountId) {
        yield* ensureExists(accountId);
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* clearActive();
              yield* activateRow({ id: accountId });
            })
          )
          .pipe(toDatabaseError('AccountManager.setActiveAccount'));
        yield* refresh();
      }),

      upsertAccount: Effect.fn('AccountManager.upsertAccount')(function* (accountInput) {
        const row = yield* upsertRow({
          id: makeAccountId(accountInput),
          serverUrl: ServerUrl.encodeSync(accountInput.serverUrl),
          username: accountInput.username,
        }).pipe(
          Effect.catchTag('NoSuchElementError', (cause) => Effect.die(cause)),
          toDatabaseError('AccountManager.upsertAccount')
        );
        yield* refresh();
        return toAccount(row);
      }),
    });
  });

  public static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DatabaseLive));
}
