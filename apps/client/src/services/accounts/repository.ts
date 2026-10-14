import { Context, Effect, Layer, Option, Schema } from 'effect';
import type { SqlError } from 'effect/sql/SqlError';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlSchema from 'effect/sql/SqlSchema';

import { AccountDatabaseError, AccountNotFoundError } from '#src/services/accounts/errors.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';

export type AccountKey = Pick<Account, 'serverUrl' | 'userId'>;
export type AccountUpsert = Omit<typeof Account.upsert.Type, 'active'>;

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/services/accounts/repository/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* MainDatabase;

      const queries = {
        list: SqlSchema.findAll({
          Request: Schema.Void,
          Result: Account,
          execute: () => sql`
            select
              *
            from
              account
            order by
              username
          `,
        }),

        getActive: SqlSchema.findOneOption({
          Request: Schema.Void,
          Result: Account,
          execute: () => sql`
            select
              *
            from
              account
            where
              active = 1
          `,
        }),

        getByStorageKey: SqlSchema.findOneOption({
          Request: Schema.Struct({
            serverUrl: Account.fields.serverUrl,
            userId: Account.fields.userId,
            authStorageId: Account.fields.authStorageId,
          }),
          Result: Account,
          execute: ({ serverUrl, userId, authStorageId }) =>
            sql`
              select
                *
              from
                account
              where
                "serverUrl" = ${serverUrl}
                and "userId" = ${userId}
                and "authStorageId" = ${authStorageId}
            `,
        }),

        getByKey: SqlSchema.findOneOption({
          Request: Schema.Struct({
            serverUrl: Account.fields.serverUrl,
            userId: Account.fields.userId,
          }),
          Result: Account,
          execute: ({ serverUrl, userId }) =>
            sql`
              select
                *
              from
                account
              where
                "serverUrl" = ${serverUrl}
                and "userId" = ${userId}
            `,
        }),

        upsert: SqlSchema.void({
          Request: Account.upsert,
          execute: (account) => sql`
            insert into
              account ${sql.insert(account)}
            on conflict ("serverUrl", "userId") do update
            set
              username = excluded.username,
              name = excluded.name,
              email = excluded.email,
              "authStorageId" = excluded."authStorageId",
              role = excluded.role,
              "profilePicture" = excluded."profilePicture",
              active = excluded.active
          `,
        }),

        deactivateAll: SqlSchema.void({
          Request: Schema.Void,
          execute: () => sql`
            update account
            set
              active = 0
            where
              active = 1
          `,
        }),

        activate: SqlSchema.findOneOption({
          Request: Schema.Struct({
            serverUrl: Account.fields.serverUrl,
            userId: Account.fields.userId,
          }),
          Result: Schema.Struct({ userId: Account.fields.userId }),
          execute: ({ serverUrl, userId }) =>
            sql`
              update account
              set
                active = 1
              where
                "serverUrl" = ${serverUrl}
                and "userId" = ${userId}
              returning
                "userId"
            `,
        }),

        updateProfile: SqlSchema.void({
          Request: Account.update,
          execute: ({ serverUrl, userId, authStorageId, ...profile }) =>
            sql`
              update account
              set
                ${sql.update(profile)}
              where
                "serverUrl" = ${serverUrl}
                and "userId" = ${userId}
                and "authStorageId" = ${authStorageId}
            `,
        }),

        remove: SqlSchema.void({
          Request: Schema.Struct({
            serverUrl: Account.fields.serverUrl,
            userId: Account.fields.userId,
            authStorageId: Account.fields.authStorageId,
          }),
          execute: ({ serverUrl, userId, authStorageId }) =>
            sql`
              delete from account
              where
                "serverUrl" = ${serverUrl}
                and "userId" = ${userId}
                and "authStorageId" = ${authStorageId}
            `,
        }),
      };

      // Normalize typed SQL/schema failures, including transaction acquisition
      // and begin failures. Effect SQL keeps commit/rollback/cleanup failures as
      // defects; do not turn uncertain transaction finalization into recovery.
      // Missing accounts remain distinct domain failures.
      const persistenceErrors = {
        SchemaError: (cause: Schema.SchemaError) => AccountDatabaseError.make({ cause }),
        SqlError: (cause: SqlError) => AccountDatabaseError.make({ cause }),
      };

      return {
        list: queries.list().pipe(Effect.catchTags(persistenceErrors)),
        getActive: queries.getActive().pipe(Effect.catchTags(persistenceErrors)),
        getByStorageKey: (key: Parameters<typeof queries.getByStorageKey>[0]) =>
          queries.getByStorageKey(key).pipe(Effect.catchTags(persistenceErrors)),
        getByKey: Effect.fnUntraced(function* (key: AccountKey) {
          const account = yield* queries.getByKey(key).pipe(Effect.catchTags(persistenceErrors));
          if (Option.isNone(account)) {
            return yield* AccountNotFoundError.make(key);
          }
          return account.value;
        }),
        setActive: Effect.fnUntraced(function* (key: AccountKey) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* queries.deactivateAll();
              const account = yield* queries.activate(key);
              if (Option.isNone(account)) {
                return yield* AccountNotFoundError.make(key);
              }
              return void 0;
            })
          );
        }, Effect.catchTags(persistenceErrors)),
        upsertActive: Effect.fnUntraced(function* (account: AccountUpsert) {
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* queries.deactivateAll();
              yield* queries.upsert({ ...account, active: true });
            })
          );
        }, Effect.catchTags(persistenceErrors)),
        updateProfile: (profile: Parameters<typeof queries.updateProfile>[0]) =>
          queries.updateProfile(profile).pipe(Effect.catchTags(persistenceErrors)),
        remove: (key: Parameters<typeof queries.remove>[0]) =>
          queries.remove(key).pipe(Effect.catchTags(persistenceErrors)),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(MainDatabase.layer));
}
