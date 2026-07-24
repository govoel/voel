import { Match, Schema, SchemaGetter } from 'effect';
import { Model } from 'effect/unstable/schema';

import type { TableFromModel } from '@repo/effect-kysely';

export class AccountRole extends Schema.Class<AccountRole, { readonly brand: unique symbol }>(
  'AccountRole'
)({
  value: Schema.Literals(['admin', 'user', 'under18']),
}) {
  public static readonly isValue = Schema.is(this.fields.value);

  public static readonly decodeSyncFromNullishString = Schema.NullishOr(Schema.String).pipe(
    Schema.decodeTo(this, {
      decode: SchemaGetter.transform((value) => ({
        value: this.isValue(value) ? value : 'under18',
      })),
      encode: SchemaGetter.transform(({ value }) => value),
    }),
    Schema.decodeSync
  );

  public static readonly formatFromNullishString = Schema.NullishOr(Schema.String).pipe(
    Schema.decodeTo(Schema.Literals(['Admin', 'User', 'Under 18', 'Unknown']), {
      decode: SchemaGetter.transform((value) =>
        this.isValue(value)
          ? Match.value(value).pipe(
              Match.when('admin', () => 'Admin' as const),
              Match.when('user', () => 'User' as const),
              Match.when('under18', () => 'Under 18' as const),
              Match.exhaustive
            )
          : ('Unknown' as const)
      ),
      encode: SchemaGetter.forbidden(() => 'encoding is forbidden'),
    }),
    Schema.decodeSync
  );
}

export class Account extends Model.Class<Account>('voel/database/main/Account')({
  serverUrl: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/serverUrl')),
    insert: Schema.String,
    update: Schema.String,
  }),
  userId: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/userId')),
    insert: Schema.String,
    update: Schema.String,
  }),
  username: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/username')),
    insert: Schema.String,
    update: Schema.String,
  }),
  authStorageId: Model.Field({
    select: Schema.String.pipe(Schema.brand('voel/database/main/Account/authStorageId')),
    insert: Schema.String,
    update: Schema.String,
  }),
  role: Model.Field({
    select: AccountRole.fields.value.pipe(Schema.brand('voel/database/main/Account/role')),
    insert: AccountRole.fields.value,
    update: AccountRole.fields.value,
  }),
  profilePicture: Model.Field({
    select: Schema.NullOr(Schema.String),
    insert: Schema.NullOr(Schema.String),
    update: Schema.NullOr(Schema.String),
  }),
  active: Model.Field({
    select: Schema.Literals([0, 1]).pipe(Schema.brand('voel/database/main/Account/active')),
    insert: Schema.Literals([0, 1]),
    update: Schema.Literals([0, 1]),
  }),
  createdAt: Model.Field({ select: Schema.Int }),
  updatedAt: Model.Field({ select: Schema.Int }),
}) {}

export type AccountTable = TableFromModel<typeof Account>;

export interface MainDatabaseTables {
  account: AccountTable;
}
