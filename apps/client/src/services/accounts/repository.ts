import { Context, Effect, Layer, Schema } from 'effect';
import { SqlSchema } from 'effect/unstable/sql';

import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';

export type AccountKey = Pick<Account, 'serverUrl' | 'userId'>;
export type AccountUpsert = typeof Account.upsert.Type;

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/services/accounts/repository/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* MainDatabase;

      return {
        list: SqlSchema.findAll({
          Request: Schema.Void,
          Result: Account,
          execute: () => sql`SELECT * FROM account ORDER BY username`,
        }),

        getActive: SqlSchema.findOneOption({
          Request: Schema.Void,
          Result: Account,
          execute: () => sql`SELECT * FROM account WHERE active = 1`,
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

        getByKey: SqlSchema.findOne({
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
          execute: () => sql`UPDATE account SET active = 0 WHERE active = 1`,
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
          }),
          execute: ({ serverUrl, userId }) =>
            sql`DELETE FROM account WHERE "serverUrl" = ${serverUrl} AND "userId" = ${userId}`,
        }),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(MainDatabase.layer));
}
