import { Match, Schema, SchemaGetter } from 'effect';
import { Model } from 'effect/unstable/schema';

import { AuthSession } from '@repo/auth-api/shared.ts';
import type { TableFromModel } from '@repo/effect-kysely';

export class AccountRole extends Schema.Class<AccountRole, { readonly brand: unique symbol }>(
  'voel/services/database/main/schema/AccountRole'
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

export class Account extends Model.Class<Account>('voel/services/database/main/schema/Account')({
  serverUrl: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('voel/services/database/main/schema/Account/serverUrl')
    ),
    insert: Schema.String,
    update: Schema.String,
  }),
  userId: Model.Field({
    select: AuthSession.fields.user.fields.id,
    insert: AuthSession.fields.user.fields.id,
    update: AuthSession.fields.user.fields.id,
  }),
  username: Model.Field({
    select: AuthSession.fields.user.fields.username,
    insert: AuthSession.fields.user.fields.username,
    update: AuthSession.fields.user.fields.username,
  }),
  name: Model.Field({
    select: AuthSession.fields.user.fields.name,
    insert: AuthSession.fields.user.fields.name,
    update: AuthSession.fields.user.fields.name,
  }),
  email: Model.Field({
    select: AuthSession.fields.user.fields.email,
    insert: AuthSession.fields.user.fields.email,
    update: AuthSession.fields.user.fields.email,
  }),
  authStorageId: Model.Field({
    select: Schema.String.pipe(
      Schema.brand('voel/services/database/main/schema/Account/authStorageId')
    ),
    insert: Schema.String,
    update: Schema.String,
  }),
  role: Model.Field({
    select: AuthSession.fields.user.fields.role,
    insert: AuthSession.fields.user.fields.role,
    update: AuthSession.fields.user.fields.role,
  }),
  profilePicture: Model.Field({
    select: AuthSession.fields.user.fields.image,
    insert: AuthSession.fields.user.fields.image,
    update: AuthSession.fields.user.fields.image,
  }),
  active: Model.Field({
    select: Schema.Literals([0, 1]).pipe(
      Schema.brand('voel/services/database/main/schema/Account/active')
    ),
    insert: Schema.Literals([0, 1]),
    update: Schema.Literals([0, 1]),
  }),
  createdAt: Model.Field({ select: Schema.Natural }),
  updatedAt: Model.Field({ select: Schema.Natural }),
}) {}

export type AccountTable = TableFromModel<typeof Account>;

export interface MainDatabaseTables {
  account: AccountTable;
}
