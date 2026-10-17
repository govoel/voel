import { Context, Effect, Layer, Option, Schema } from 'effect';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlSchema from 'effect/sql/SqlSchema';

import { MainDatabase } from '#src/database/main/index.ts';
import { AccountDatabaseError, AccountNotFoundError } from '#src/domains/accounts/errors.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import type { AccountKey, AccountUpsert } from '#src/domains/accounts/schema.ts';

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/domains/accounts/repository/AccountRepository',
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
              account ${sql.insert({ ...account, active: 1 })}
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

      // Only connection unavailability and lock contention are recoverable.
      // Schema/invariant violations and all other SQL failures are defects.
      // Effect SQL also keeps transaction finalization failures as defects.
      return {
        list: queries.list().pipe(
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        getActive: queries.getActive().pipe(
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        getByStorageKey: (key: Parameters<typeof queries.getByStorageKey>[0]) =>
          queries.getByStorageKey(key).pipe(
            Effect.catchReasons(
              'SqlError',
              {
                ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
                LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              },
              (_reason, cause) => Effect.die(cause)
            ),
            Effect.catchTags({ SchemaError: Effect.die })
          ),
        getByKey: Effect.fnUntraced(function* (key: AccountKey) {
          const account = yield* queries.getByKey(key).pipe(
            Effect.catchReasons(
              'SqlError',
              {
                ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
                LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              },
              (_reason, cause) => Effect.die(cause)
            ),
            Effect.catchTags({ SchemaError: Effect.die })
          );
          if (Option.isNone(account)) {
            return yield* AccountNotFoundError.make(key);
          }
          return account.value;
        }),
        setActive: Effect.fnUntraced(
          function* (key: AccountKey) {
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
          },
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        upsertActive: Effect.fnUntraced(
          function* (account: AccountUpsert) {
            yield* sql.withTransaction(
              Effect.gen(function* () {
                yield* queries.deactivateAll();
                yield* queries.upsert(account);
              })
            );
          },
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        updateProfile: (profile: Parameters<typeof queries.updateProfile>[0]) =>
          queries.updateProfile(profile).pipe(
            Effect.catchReasons(
              'SqlError',
              {
                ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
                LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              },
              (_reason, cause) => Effect.die(cause)
            ),
            Effect.catchTags({ SchemaError: Effect.die })
          ),
        remove: (key: Parameters<typeof queries.remove>[0]) =>
          queries.remove(key).pipe(
            Effect.catchReasons(
              'SqlError',
              {
                ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
                LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              },
              (_reason, cause) => Effect.die(cause)
            ),
            Effect.catchTags({ SchemaError: Effect.die })
          ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);

  public static readonly layer = this.layerNoDeps.pipe(Layer.provide(MainDatabase.layer));
}
