import { Match, Schema, SchemaGetter } from 'effect';
import { VariantSchema } from 'effect/unstable/schema';

import { AuthSession } from '@repo/auth-api/shared.ts';

const DbModel = VariantSchema.make({
  variants: ['select', 'upsert', 'update'],
  defaultVariant: 'select',
});

export class Account extends DbModel.Class<Account>('voel/services/database/main/schema/Account')({
  serverUrl: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('voel/services/database/main/schema/Account/serverUrl')
    ),
    upsert: Schema.String,
    update: Schema.String,
  }),
  userId: DbModel.Field({
    select: AuthSession.fields.user.fields.id,
    upsert: AuthSession.fields.user.fields.id,
    update: AuthSession.fields.user.fields.id,
  }),
  username: DbModel.Field({
    select: AuthSession.fields.user.fields.username,
    upsert: AuthSession.fields.user.fields.username,
    update: AuthSession.fields.user.fields.username,
  }),
  name: DbModel.Field({
    select: AuthSession.fields.user.fields.name,
    upsert: AuthSession.fields.user.fields.name,
    update: AuthSession.fields.user.fields.name,
  }),
  email: DbModel.Field({
    select: AuthSession.fields.user.fields.email,
    upsert: AuthSession.fields.user.fields.email,
    update: AuthSession.fields.user.fields.email,
  }),
  authStorageId: DbModel.Field({
    select: Schema.String.pipe(
      Schema.brand('voel/services/database/main/schema/Account/authStorageId')
    ),
    upsert: Schema.String,
    update: Schema.String,
  }),
  role: DbModel.Field({
    select: AuthSession.fields.user.fields.role,
    upsert: AuthSession.fields.user.fields.role,
    update: AuthSession.fields.user.fields.role,
  }),
  profilePicture: DbModel.Field({
    select: AuthSession.fields.user.fields.image,
    upsert: AuthSession.fields.user.fields.image,
    update: AuthSession.fields.user.fields.image,
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
