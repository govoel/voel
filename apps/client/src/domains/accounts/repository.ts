import { Context, Effect, Layer, Option, Schema, SchemaGetter, Struct } from 'effect';
import { Aead, SecureRandom } from 'effect/crypto';
import { Reactivity } from 'effect/reactivity';
import { SqlSchema } from 'effect/sql';

import { MainDatabase } from '#src/database/main/index.ts';
import { AccountEncryptionKey } from '#src/domains/accounts/encryption/key.ts';
import {
  AccountCredentialsError,
  AccountDatabaseError,
  AccountNotFoundError,
} from '#src/domains/accounts/errors.ts';
import { AccountKey, Account as DbAccount } from '#src/domains/accounts/schema.ts';
import { ExpoAeadLayer, ExpoSecureRandomLayer } from '#src/runtime/crypto.ts';

export class Account extends Schema.Struct({
  key: AccountKey,
  ...Struct.map(
    Struct.omit(DbAccount.fields, ['serverUrl', 'userId', 'authStorage']),
    Schema.toType
  ),
}) {}

class AccountRow extends Schema.Struct({
  ...Struct.omit(DbAccount.fields, ['serverUrl', 'userId', 'authStorage']),
  ...Struct.map(AccountKey.fields, Schema.toEncoded),
}).pipe(
  Schema.decodeTo(Account, {
    decode: SchemaGetter.transform(({ serverUrl, userId, ...details }) => ({
      key: { serverUrl, userId },
      ...details,
    })),
    encode: SchemaGetter.transform(({ key, ...details }) => ({
      serverUrl: key.serverUrl,
      userId: key.userId,
      ...details,
    })),
  })
) {}

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/domains/accounts/repository/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* MainDatabase;
      const crypto = yield* Effect.context<
        AccountEncryptionKey | Aead.Aead | SecureRandom.SecureRandom
      >().pipe(
        Effect.map(Context.pick(AccountEncryptionKey, Aead.Aead, SecureRandom.SecureRandom))
      );
      const queries = {
        list: SqlSchema.findAll({
          Request: Schema.Void,
          Result: AccountRow,
          execute: () => sql`
            select
              "serverUrl",
              "userId",
              username,
              name,
              email,
              role,
              "profilePicture",
              active,
              "createdAt",
              "updatedAt"
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
          Result: AccountRow,
          execute: ({ serverUrl, userId }) => sql`
            select
              "serverUrl",
              "userId",
              username,
              name,
              email,
              role,
              "profilePicture",
              active,
              "createdAt",
              "updatedAt"
            from
              account
            where
              "serverUrl" = ${serverUrl}
              and "userId" = ${userId}
          `,
        }),
        upsert: SqlSchema.findOne({
          Request: DbAccount.upsert.pipe(Schema.middlewareEncoding(Effect.provideContext(crypto))),
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
            profile: Schema.Struct(Struct.omit(DbAccount.update.fields, ['serverUrl', 'userId'])),
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
          Result: Schema.Struct({ authStorage: DbAccount.fields.authStorage }).pipe(
            Schema.middlewareDecoding(Effect.provideContext(crypto))
          ),
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
          Request: Schema.Struct({
            key: AccountKey,
            authStorage: DbAccount.fields.authStorage,
          }).pipe(Schema.middlewareEncoding(Effect.provideContext(crypto))),
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
      const readAuthStorage = Effect.fnUntraced(function* (key: AccountKey) {
        const row = yield* queries.readAuthStorage(key).pipe(
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTag('SchemaError', (cause) => AccountCredentialsError.make({ cause }))
        );
        return Option.isNone(row) ? {} : row.value.authStorage;
      });

      // Mutation invalidations are registered inside the transaction and published
      // only by its outermost commit. Schema and SQL invariant violations are defects.
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
        getActiveKey: queries.getActiveKey().pipe(
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
        findByKey: (key: AccountKey) =>
          queries.findByKey(key).pipe(
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
          function* (account: typeof DbAccount.upsert.Type) {
            yield* queries.deactivateAll();
            return yield* queries
              .upsert(account)
              .pipe(Effect.catchTags({ NoSuchElementError: Effect.die }));
          },
          Reactivity.mutation(['account']),
          sql.withTransaction,
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTag('SchemaError', (cause) => AccountCredentialsError.make({ cause }))
        ),
        updateProfile: (input: Parameters<typeof queries.updateProfile>[0]) =>
          queries.updateProfile(input).pipe(
            Reactivity.mutation(['account']),
            sql.withTransaction,
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
        remove: (key: AccountKey) =>
          queries.remove(key).pipe(
            Reactivity.mutation(['account']),
            sql.withTransaction,
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
            yield* queries.writeAuthStorage({ key, authStorage: { ...previous, [name]: value } });
          },
          sql.withTransaction,
          Effect.catchReasons(
            'SqlError',
            {
              ConnectionError: (_reason, cause) => AccountDatabaseError.make({ cause }),
              LockTimeoutError: (_reason, cause) => AccountDatabaseError.make({ cause }),
            },
            (_reason, cause) => Effect.die(cause)
          ),
          Effect.catchTag('SchemaError', (cause) => AccountCredentialsError.make({ cause }))
        ),
      };
    }),
  }
) {
  public static readonly layerNoDeps = Layer.effect(this, this.make);
  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([MainDatabase.layer, AccountEncryptionKey.layer]),
    Layer.provide([ExpoAeadLayer, ExpoSecureRandomLayer])
  );
}
