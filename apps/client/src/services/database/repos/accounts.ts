import { Context, Effect, Layer, Option, Schema } from 'effect';
import { VariantSchema } from 'effect/unstable/schema';
import { SqlClient, SqlSchema } from 'effect/unstable/sql';

import { toDatabaseError } from '#src/services/database/index.ts';

const { Class, Field } = VariantSchema.make({
  variants: ['id', 'select', 'upsert'],
  defaultVariant: 'select',
});

export class AccountTable extends Class<AccountTable>('AccountTable')({
  serverUrl: Field({
    id: Schema.URLFromString.pipe(Schema.brand('AccountServerUrl')),
    select: Schema.URLFromString.pipe(Schema.brand('AccountServerUrl')),
    upsert: Schema.URLFromString,
  }),
  username: Field({
    id: Schema.NonEmptyString.pipe(Schema.brand('AccountUsername')),
    select: Schema.NonEmptyString.pipe(Schema.brand('AccountUsername')),
    upsert: Schema.NonEmptyString,
  }),
  active: Field({
    select: Schema.BooleanFromBit.pipe(Schema.brand('AccountActive')),
    upsert: Schema.Option(Schema.BooleanFromBit),
  }),
}) {}

export class AccountRepository extends Context.Service<AccountRepository>()(
  'voel/services/database/repos/accounts/AccountRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const get = SqlSchema.findOne({
        Request: AccountTable.id,
        Result: AccountTable.select,
        execute: ({ serverUrl, username }) => sql`
          select serverUrl, username, active
          from account
          where serverUrl = ${serverUrl} and username = ${username}`,
      });

      const list = SqlSchema.findAll({
        Request: Schema.Void,
        Result: AccountTable.select,
        execute: () =>
          sql`select serverUrl, username, active from account order by serverUrl, username`,
      });

      const upsert = SqlSchema.findOne({
        Request: AccountTable.upsert,
        Result: AccountTable.select,
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
        Request: AccountTable.id,
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
