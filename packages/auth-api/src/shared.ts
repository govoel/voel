import { Schema } from 'effect';

export class AuthUser extends Schema.Class<AuthUser, { readonly brand: unique symbol }>(
  '@repo/auth-api/AuthUser'
)({
  id: Schema.String.pipe(Schema.brand('@repo/auth-api/AuthUser/id')),
  username: Schema.String.pipe(Schema.brand('@repo/auth-api/AuthUser/username')),
  email: Schema.String.pipe(Schema.brand('@repo/auth-api/AuthUser/email')),
  name: Schema.String.pipe(Schema.brand('@repo/auth-api/AuthUser/name')),
  role: Schema.Literals(['admin', 'user', 'under18']).pipe(
    Schema.brand('@repo/auth-api/AuthUser/role')
  ),
  image: Schema.NullishOr(Schema.String).pipe(Schema.brand('@repo/auth-api/AuthUser/image')),
  createdAt: Schema.DateTimeUtcFromDate.pipe(Schema.brand('@repo/auth-api/AuthUser/createdAt')),
  updatedAt: Schema.DateTimeUtcFromDate.pipe(Schema.brand('@repo/auth-api/AuthUser/updatedAt')),
}) {
  public static readonly decodeFromUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class AuthSession extends Schema.Class<AuthSession, { readonly brand: unique symbol }>(
  '@repo/auth-api/server/AuthSession'
)({
  user: AuthUser,
  session: Schema.Struct({
    id: Schema.String.pipe(Schema.brand('@repo/auth-api/server/AuthSession/session/id')),
    userId: Schema.String.pipe(Schema.brand('@repo/auth-api/server/AuthSession/session/userId')),
    token: Schema.String.pipe(Schema.brand('@repo/auth-api/server/AuthSession/session/token')),
    ipAddress: Schema.NullishOr(Schema.String).pipe(
      Schema.brand('@repo/auth-api/server/AuthSession/session/ipAddress')
    ),
    userAgent: Schema.NullishOr(Schema.String).pipe(
      Schema.brand('@repo/auth-api/server/AuthSession/session/userAgent')
    ),
    expiresAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/server/AuthSession/session/expiresAt')
    ),
    createdAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/server/AuthSession/session/createdAt')
    ),
    updatedAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/server/AuthSession/session/updatedAt')
    ),
  }),
}) {
  public static readonly decodeFromUnknownEffect = Schema.decodeUnknownEffect(this);
}

export class UnexpectedAuthSessionError extends Schema.TaggedError<
  UnexpectedAuthSessionError,
  { readonly brand: unique symbol }
>('@repo/auth-api/server/UnexpectedAuthSessionError')('UnexpectedAuthSessionError', {}) {}
