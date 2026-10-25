import { Context, Effect, Layer, Match, Option, Schema, Struct } from 'effect';
import { Reactivity } from 'effect/reactivity';
import type { SqlError } from 'effect/sql/SqlError';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlSchema from 'effect/sql/SqlSchema';

import { MainDatabase } from '#src/database/main/index.ts';
import { AuthEncryption } from '#src/domains/accounts/auth-client/encryption.ts';
import { AccountDatabaseError, AccountNotFoundError } from '#src/domains/accounts/errors.ts';
import type { AuthStorageData } from '#src/domains/accounts/schema.ts';
import { Account, AccountKey, EncryptedAuthStorage } from '#src/domains/accounts/schema.ts';

const recoverSqlError = (cause: SqlError) =>
  Match.value(cause.reason).pipe(
    Match.tags({
      ConnectionError: () => AccountDatabaseError.make({ cause }),
      LockTimeoutError: () => AccountDatabaseError.make({ cause }),
    }),
    Match.orElse(() => Effect.die(cause))
  );

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/domains/accounts/repository/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* MainDatabase;
      const encryption = yield* AuthEncryption;
      const queries = {
        list: SqlSchema.findAll({
          Request: Schema.Void,
          Result: Account,
          execute: () => sql`
            select
              *,
              json_object('serverUrl', "serverUrl", 'userId', "userId") as key
            from
              account
            order by
              username
          `,
        }),
        getActiveKey: SqlSchema.findOneOption({
          Request: Schema.Void,
          Result: AccountKey,
          execute: () => sql`
            select
              "serverUrl",
              "userId"
            from
              account
            where
              active = 1
          `,
        }),
        findByKey: SqlSchema.findOneOption({
          Request: AccountKey,
          Result: Account,
          execute: ({ serverUrl, userId }) => sql`
            select
              *,
              json_object('serverUrl', "serverUrl", 'userId', "userId") as key
            from
              account
            where
              "serverUrl" = ${serverUrl}
              and "userId" = ${userId}
          `,
        }),
        upsert: SqlSchema.findOne({
          Request: Schema.Struct({ ...Account.upsert.fields, authStorage: EncryptedAuthStorage }),
          Result: AccountKey,
          execute: (account) => sql`
            insert into
              account ${sql.insert({ ...account, active: 1 })}
            on conflict ("serverUrl", "userId") do update
            set
              username = excluded.username,
              name = excluded.name,
              email = excluded.email,
              "authStorage" = excluded."authStorage",
              role = excluded.role,
              "profilePicture" = excluded."profilePicture",
              active = excluded.active
            returning
              "serverUrl",
              "userId"
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
          Request: AccountKey,
          Result: AccountKey,
          execute: ({ serverUrl, userId }) => sql`
            update account
            set
              active = 1
            where
              "serverUrl" = ${serverUrl}
              and "userId" = ${userId}
            returning
              "serverUrl",
              "userId"
          `,
        }),
        updateProfile: SqlSchema.void({
          Request: Schema.Struct({
            key: AccountKey,
            profile: Schema.Struct(Struct.omit(Account.update.fields, ['serverUrl', 'userId'])),
          }),
          execute: ({ key, profile }) => sql`
            update account
            set
              ${sql.update(profile)}
            where
              "serverUrl" = ${key.serverUrl}
              and "userId" = ${key.userId}
          `,
        }),
        remove: SqlSchema.void({
          Request: AccountKey,
          execute: ({ serverUrl, userId }) => sql`
            delete from account
            where
              "serverUrl" = ${serverUrl}
              and "userId" = ${userId}
          `,
        }),
        readAuthStorage: SqlSchema.findOneOption({
          Request: AccountKey,
          Result: Schema.Struct({ authStorage: EncryptedAuthStorage }),
          execute: ({ serverUrl, userId }) => sql`
            select
              "authStorage"
            from
              account
            where
              "serverUrl" = ${serverUrl}
              and "userId" = ${userId}
          `,
        }),
        writeAuthStorage: SqlSchema.void({
          Request: Schema.Struct({ key: AccountKey, authStorage: EncryptedAuthStorage }),
          execute: ({ key, authStorage }) => sql`
            update account
            set
              "authStorage" = ${authStorage}
            where
              "serverUrl" = ${key.serverUrl}
              and "userId" = ${key.userId}
          `,
        }),
      };
      const findByKey = (key: AccountKey) =>
        queries
          .findByKey(key)
          .pipe(
            Effect.catchTags({ SqlError: recoverSqlError }),
            Effect.catchTags({ SchemaError: Effect.die })
          );
      const readAuthStorage = Effect.fnUntraced(function* (key: AccountKey) {
        const row = yield* queries
          .readAuthStorage(key)
          .pipe(
            Effect.catchTags({ SqlError: recoverSqlError }),
            Effect.catchTags({ SchemaError: Effect.die })
          );
        if (Option.isNone(row)) {
          return {} satisfies typeof AuthStorageData.Type;
        }
        return yield* encryption.decrypt({
          data: row.value.authStorage,
          context: yield* AccountKey.encodeContext(key),
        });
      });

      // Mutation invalidations are registered inside the transaction and published
      // only by its outermost commit. Schema and SQL invariant violations are defects.
      return {
        prepareCredentials: encryption.prepare,
        list: queries
          .list()
          .pipe(
            Effect.catchTags({ SqlError: recoverSqlError }),
            Effect.catchTags({ SchemaError: Effect.die })
          ),
        getActiveKey: queries
          .getActiveKey()
          .pipe(
            Effect.catchTags({ SqlError: recoverSqlError }),
            Effect.catchTags({ SchemaError: Effect.die })
          ),
        findByKey,
        getByKey: Effect.fnUntraced(function* (key: AccountKey) {
          const account = yield* findByKey(key);
          if (Option.isNone(account)) {
            return yield* AccountNotFoundError.make(key);
          }
          return account.value;
        }),
        setActive: Effect.fnUntraced(
          function* (key: AccountKey) {
            yield* queries.deactivateAll();
            const account = yield* queries.activate(key);
            if (Option.isNone(account)) {
              return yield* AccountNotFoundError.make(key);
            }
            return void 0;
          },
          Reactivity.mutation(['account']),
          sql.withTransaction,
          Effect.catchTags({ SqlError: recoverSqlError }),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        upsertActive: Effect.fnUntraced(
          function* ({
            account,
            authStorage,
          }: {
            readonly account: typeof Account.upsert.Type;
            readonly authStorage: typeof AuthStorageData.Type;
          }) {
            // Encryption (including key creation) must succeed before selection changes.
            const encrypted = yield* encryption.encrypt({
              data: authStorage,
              context: yield* AccountKey.encodeContext(account),
            });
            return yield* Effect.gen(function* () {
              yield* queries.deactivateAll();
              return yield* queries
                .upsert({ ...account, authStorage: encrypted })
                .pipe(Effect.catchTags({ NoSuchElementError: Effect.die }));
            }).pipe(Reactivity.mutation(['account']), sql.withTransaction);
          },
          Effect.catchTags({ SqlError: recoverSqlError }),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
        updateProfile: (input: Parameters<typeof queries.updateProfile>[0]) =>
          queries
            .updateProfile(input)
            .pipe(
              Reactivity.mutation(['account']),
              sql.withTransaction,
              Effect.catchTags({ SqlError: recoverSqlError }),
              Effect.catchTags({ SchemaError: Effect.die })
            ),
        remove: (key: AccountKey) =>
          queries
            .remove(key)
            .pipe(
              Reactivity.mutation(['account']),
              sql.withTransaction,
              Effect.catchTags({ SqlError: recoverSqlError }),
              Effect.catchTags({ SchemaError: Effect.die })
            ),
        readAuthStorage,
        writeAuthStorageItem: Effect.fnUntraced(
          function* ({
            key,
            name,
            value,
          }: {
            readonly key: AccountKey;
            readonly name: string;
            readonly value: string;
          }) {
            // Serialize the entire read/decrypt/modify/encrypt/write, including
            // Better Auth's chunk keys. Never recreate a removed account here.
            const previous = yield* readAuthStorage(key);
            const authStorage = yield* encryption.encrypt({
              data: { ...previous, [name]: value },
              context: yield* AccountKey.encodeContext(key),
            });
            yield* queries.writeAuthStorage({ key, authStorage });
          },
          sql.withTransaction,
          Effect.catchTags({ SqlError: recoverSqlError }),
          Effect.catchTags({ SchemaError: Effect.die })
        ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);
  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([MainDatabase.layer, AuthEncryption.layer])
  );
}
