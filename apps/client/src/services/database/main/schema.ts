import { Match, Schema, SchemaGetter } from 'effect';
import { VariantSchema } from 'effect/unstable/schema';

import { AuthUser } from '@repo/auth-api/shared.ts';

import { ServerUrl } from '#src/services/accounts/schema.ts';

const DbModel = VariantSchema.make({
  variants: ['select', 'upsert', 'update'],
  defaultVariant: 'select',
});

export class Account extends DbModel.Class<Account>('voel/services/database/main/schema/Account')({
  serverUrl: DbModel.Field({
    select: ServerUrl,
    upsert: ServerUrl,
    update: ServerUrl,
  }),
  userId: DbModel.Field({
    select: AuthUser.fields.id,
    upsert: AuthUser.fields.id,
    update: AuthUser.fields.id,
  }),
  username: DbModel.Field({
    select: AuthUser.fields.username,
    upsert: AuthUser.fields.username,
    update: AuthUser.fields.username,
  }),
  name: DbModel.Field({
    select: AuthUser.fields.name,
    upsert: AuthUser.fields.name,
    update: AuthUser.fields.name,
  }),
  email: DbModel.Field({
    select: AuthUser.fields.email,
    upsert: AuthUser.fields.email,
    update: AuthUser.fields.email,
  }),
  authStorageId: Schema.String.pipe(
    Schema.brand('voel/services/database/main/schema/Account/authStorageId')
  ),
  role: DbModel.Field({
    select: AuthUser.fields.role,
    upsert: AuthUser.fields.role,
    update: AuthUser.fields.role,
  }),
  profilePicture: DbModel.Field({
    select: AuthUser.fields.image,
    upsert: AuthUser.fields.image,
    update: AuthUser.fields.image,
  }),
  active: DbModel.Field({
    select: Schema.BooleanFromBit.pipe(
      Schema.brand('voel/services/database/main/schema/Account/active')
    ),
    upsert: Schema.BooleanFromBit,
  }),
  createdAt: DbModel.Field({ select: Schema.DateTimeUtcFromMillis }),
  updatedAt: DbModel.Field({ select: Schema.DateTimeUtcFromMillis }),
}) {
  public static readonly roleToDisplayString = this.fields.role.pipe(
    Schema.decodeTo(
      Schema.Literals(['Admin', 'User', 'Under 18']).pipe(
        Schema.brand('voel/services/database/main/schema/Account/roleDisplayString')
      ),
      {
        decode: SchemaGetter.transform((role) =>
          Match.value(role).pipe(
            Match.when('admin', () => 'Admin' as const),
            Match.when('user', () => 'User' as const),
            Match.when('under18', () => 'Under 18' as const),
            Match.exhaustive
          )
        ),
        encode: SchemaGetter.transform((role) =>
          Match.value(role).pipe(
            Match.when('Admin', () => this.fields.role.make('admin')),
            Match.when('User', () => this.fields.role.make('user')),
            Match.when('Under 18', () => this.fields.role.make('under18')),
            Match.exhaustive
          )
        ),
      }
    ),
    Schema.decodeSync
  );
}
