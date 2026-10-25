import { Effect, Match, Schema, SchemaGetter } from 'effect';
import { VariantSchema } from 'effect/schema';

import { AuthUser } from '@repo/auth-api/shared.ts';

/** A root HTTP(S) server address. Validation preserves existing account/storage keys. */
export const ServerUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!/^https?:\/\/[^/?#@\\\s]+\/?$/iu.test(value) || !URL.canParse(value)) {
      return 'Server URL must be an HTTP(S) origin without a path, query, or fragment';
    }
    const url = new URL(value);
    return (
      (url.username === '' && url.password === '' && url.pathname === '/') ||
      'Server URL must not contain credentials, whitespace, or a path'
    );
  })
).pipe(Schema.brand('voel/domains/accounts/schema/ServerUrl'));

const DbModel = VariantSchema.make({
  variants: ['select', 'upsert', 'update'],
  defaultVariant: 'select',
});

class AccountIdentity extends Schema.Struct({ serverUrl: ServerUrl, userId: AuthUser.fields.id }) {}
const encodeIdentity = Schema.encodeEffect(Schema.fromJsonString(AccountIdentity));

/** A persisted account identity, decoded by the repository rather than assembled by callers. */
export class AccountKey extends Schema.Class<AccountKey, { readonly brand: unique symbol }>(
  'voel/domains/accounts/schema/AccountKey'
)(AccountIdentity.fields) {
  /** Canonical bytes for encryption AAD and stable replica filenames, not a key constructor. */
  public static readonly encodeContext = (identity: typeof AccountIdentity.Type) =>
    encodeIdentity(identity).pipe(Effect.orDie);
}

export const AuthStorageData = Schema.Record(Schema.String, Schema.String);

export const EncryptedAuthStorage = Schema.String.pipe(
  Schema.brand('voel/domains/accounts/schema/EncryptedAuthStorage')
);

export class Account extends DbModel.Class<Account>('voel/domains/accounts/schema/Account')({
  key: DbModel.Field({ select: Schema.fromJsonString(AccountKey) }),
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
    select: Schema.BooleanFromBit.pipe(Schema.brand('voel/domains/accounts/schema/Account/active')),
  }),
  createdAt: DbModel.Field({ select: Schema.DateTimeUtcFromMillis }),
  updatedAt: DbModel.Field({ select: Schema.DateTimeUtcFromMillis }),
}) {
  public static readonly roleToDisplayString = this.fields.role.pipe(
    Schema.decodeTo(
      Schema.Literals(['Admin', 'User', 'Under 18']).pipe(
        Schema.brand('voel/domains/accounts/schema/Account/roleDisplayString')
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
