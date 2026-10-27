import { Context, Effect, Layer, Option, Schema, SchemaGetter, Struct } from 'effect';
import { Reactivity } from 'effect/reactivity';
// oxlint-disable-next-line effect-conventions/no-effect-namespace-import -- The SQL barrel pulls in Migrator, whose dynamic import breaks Metro.
import * as SqlSchema from 'effect/sql/SqlSchema';

import { MainDatabase } from '#src/database/main/index.ts';
import { Encryption } from '#src/domains/accounts/encryption/index.ts';
import {
  AccountCredentialsError,
  AccountDatabaseError,
  AccountNotFoundError,
} from '#src/domains/accounts/errors.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';

/** Reshape encoded SQL columns, then decode the repository's key-aware projection. */
const accountFromRow = Schema.toEncoded(
  Schema.Struct(Struct.omit(Account.fields, ['authStorage']))
).pipe(
  Schema.decodeTo(
    Schema.Struct({
      key: AccountKey,
      ...Struct.omit(Account.fields, ['serverUrl', 'userId', 'authStorage']),
    }),
    {
      decode: SchemaGetter.transform(({ serverUrl, userId, ...details }) => ({
        key: { serverUrl, userId },
        ...details,
      })),
      encode: SchemaGetter.transform(({ key, ...details }) => ({ ...key, ...details })),
    }
  )
);

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/domains/accounts/repository/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* MainDatabase;
      const encryption = yield* Encryption;
      const queries = {
        list: SqlSchema.findAll({
          Request: Schema.Void,
          Result: accountFromRow,
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
          Result: accountFromRow,
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
          Request: Account.upsert.pipe(
            Schema.middlewareEncoding(Effect.provideService(Encryption, encryption))
          ),
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
          Result: Schema.Struct({ authStorage: Account.fields.authStorage }).pipe(
            Schema.middlewareDecoding(Effect.provideService(Encryption, encryption))
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
          Request: Schema.Struct({ key: AccountKey, authStorage: Account.fields.authStorage }).pipe(
            Schema.middlewareEncoding(Effect.provideService(Encryption, encryption))
          ),
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
          function* (account: typeof Account.upsert.Type) {
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
  public static readonly fromRow = accountFromRow;

  public static readonly layerNoDeps = Layer.effect(this, this.make);
  public static readonly layer = this.layerNoDeps.pipe(
    Layer.provide([MainDatabase.layer, Encryption.layer])
  );
}
