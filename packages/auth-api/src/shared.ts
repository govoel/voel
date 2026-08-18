import { Schema } from 'effect';

/** A structured API error returned by Better Auth. */
export class BetterAuthApiError extends Schema.Error<
  BetterAuthApiError,
  { readonly brand: unique symbol }
>('@repo/auth-api/BetterAuthApiError')({
  // Better Auth does not include our discriminator in its error responses.
  _tag: Schema.tagDefaultOmit('BetterAuthApiError'),
  code: Schema.String,
  message: Schema.optional(Schema.String),
  status: Schema.Finite,
  statusText: Schema.String,
}) {
  public static readonly decodeUnknownOption = Schema.decodeUnknownOption(this);
}

/** The Better Auth client could not complete a request. */
export class AuthTransportError extends Schema.TaggedError<
  AuthTransportError,
  { readonly brand: unique symbol }
>('@repo/auth-api/AuthTransportError')('AuthTransportError', {
  cause: Schema.Defect(),
}) {}

/** Better Auth returned an empty or malformed response. */
export class InvalidAuthResponseError extends Schema.TaggedError<
  InvalidAuthResponseError,
  { readonly brand: unique symbol }
>('@repo/auth-api/InvalidAuthResponseError')('InvalidAuthResponseError', {}) {}

export class AuthError extends Schema.TaggedError<AuthError, { readonly brand: unique symbol }>(
  '@repo/auth-api/AuthError'
)('AuthError', {
  reason: Schema.Union([BetterAuthApiError, AuthTransportError, InvalidAuthResponseError]),
}) {}

class AuthUser extends Schema.Class<AuthUser, { readonly brand: unique symbol }>(
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
}) {}

export class AuthUserResponse extends Schema.Class<AuthUserResponse>('AuthUserResponse')({
  token: Schema.String.pipe(Schema.brand('@repo/auth-api/AuthUserResponse/token')),
  user: AuthUser,
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
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
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}
