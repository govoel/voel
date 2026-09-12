import { Schema } from 'effect';

/** A structured API error returned by Better Auth. */
export class BetterAuthApiError extends Schema.Error<
  BetterAuthApiError,
  { readonly brand: unique symbol }
>('@repo/auth-api/shared/BetterAuthApiError')({
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
>('@repo/auth-api/shared/AuthTransportError')('AuthTransportError', {
  cause: Schema.Defect(),
}) {}

/** Better Auth returned an empty or malformed response. */
export class InvalidAuthResponseError extends Schema.TaggedError<
  InvalidAuthResponseError,
  { readonly brand: unique symbol }
>('@repo/auth-api/shared/InvalidAuthResponseError')('InvalidAuthResponseError', {}) {}

/** A command did not satisfy the application's authentication contract. */
export class InvalidAuthInputError extends Schema.TaggedError<
  InvalidAuthInputError,
  { readonly brand: unique symbol }
>('@repo/auth-api/shared/InvalidAuthInputError')('InvalidAuthInputError', {}) {}

export class AuthError extends Schema.TaggedError<AuthError, { readonly brand: unique symbol }>(
  '@repo/auth-api/shared/AuthError'
)('AuthError', {
  reason: Schema.Union([
    BetterAuthApiError,
    AuthTransportError,
    InvalidAuthResponseError,
    InvalidAuthInputError,
  ]),
}) {}

const AuthUserId = Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthUserId'));
const AuthSessionToken = Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthSessionToken'));

export class AuthUser extends Schema.Struct({
  id: AuthUserId,
  username: Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthUser/username')),
  email: Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthUser/email')),
  name: Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthUser/name')),
  role: Schema.Literals(['admin', 'user', 'under18']).pipe(
    Schema.brand('@repo/auth-api/shared/AuthUser/role')
  ),
  image: Schema.NullishOr(Schema.String).pipe(Schema.brand('@repo/auth-api/shared/AuthUser/image')),
  createdAt: Schema.DateTimeUtcFromDate.pipe(
    Schema.brand('@repo/auth-api/shared/AuthUser/createdAt')
  ),
  updatedAt: Schema.DateTimeUtcFromDate.pipe(
    Schema.brand('@repo/auth-api/shared/AuthUser/updatedAt')
  ),
}) {}

export class AuthUserResponse extends Schema.Struct({
  token: AuthSessionToken,
  user: AuthUser,
}) {}

export class AuthSession extends Schema.Struct({
  user: AuthUser,
  session: Schema.Struct({
    id: Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthSession/session/id')),
    userId: AuthUserId,
    token: AuthSessionToken,
    ipAddress: Schema.NullishOr(
      Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthSession/session/ipAddress'))
    ),
    userAgent: Schema.NullishOr(
      Schema.String.pipe(Schema.brand('@repo/auth-api/shared/AuthSession/session/userAgent'))
    ),
    expiresAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/shared/AuthSession/session/expiresAt')
    ),
    createdAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/shared/AuthSession/session/createdAt')
    ),
    updatedAt: Schema.DateTimeUtcFromDate.pipe(
      Schema.brand('@repo/auth-api/shared/AuthSession/session/updatedAt')
    ),
  }),
}) {
  public static readonly decodeUnknownEffect = Schema.decodeUnknownEffect(this);
}

/** Admin operations return the same user domain as authentication. */
export class AuthAdminUserResponse extends Schema.Struct({ user: AuthUser }) {}

export class AuthUsersPage extends Schema.Struct({
  users: Schema.Array(AuthUser),
  total: Schema.Natural,
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  offset: Schema.optional(Schema.Natural),
}) {}

// Commands accept editable text, not persisted user values. Identities and roles
// retain their domain schemas; Better Auth's extensible field bags stay internal.
const UsernameInput = Schema.toEncoded(AuthUser.fields.username).check(
  Schema.isNonEmpty({ message: 'Username is required' })
);
const NameInput = Schema.toEncoded(AuthUser.fields.name).check(
  Schema.isNonEmpty({ message: 'Name is required' })
);
const EmailInput = Schema.toEncoded(AuthUser.fields.email).check(
  Schema.isNonEmpty({ message: 'Email is required' })
);
const PasswordInput = Schema.String.check(Schema.isNonEmpty({ message: 'Password is required' }));
const NewPasswordInput = PasswordInput.check(Schema.isMinLength(8), Schema.isMaxLength(128));

export class AuthSignInInput extends Schema.Struct({
  username: UsernameInput,
  password: PasswordInput,
}) {}

export class AuthSignUpInput extends Schema.Struct({
  username: UsernameInput,
  name: NameInput,
  email: EmailInput,
  password: PasswordInput,
}) {}

export class AuthCreateUserInput extends AuthSignUpInput.pipe(
  Schema.fieldsAssign({ role: AuthUser.fields.role, password: NewPasswordInput })
) {}

export class AuthSetRoleInput extends Schema.Struct({
  userId: AuthUserId,
  role: AuthUser.fields.role,
}) {}

export class AuthListUsersInput extends Schema.Struct({
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
  offset: Schema.Natural,
}) {}

export class AuthUpdateUserInput extends Schema.Struct({
  name: Schema.optional(NameInput),
  username: Schema.optional(UsernameInput),
  image: Schema.optional(Schema.NullOr(Schema.String)),
}) {}

/** Match Better Auth's configured password limits without weakening sign-in validation. */
export class AuthChangePasswordInput extends Schema.Struct({
  currentPassword: PasswordInput,
  newPassword: NewPasswordInput,
}) {}

export class AuthDeviceSession extends AuthSession.fields.session {}

export class AuthRevokeSessionInput extends Schema.Struct({ token: AuthSessionToken }) {}

export class AuthUserIdInput extends Schema.Struct({ userId: AuthUserId }) {}

export class AuthAdminUserDetails extends AuthUser.pipe(
  Schema.fieldsAssign({
    emailVerified: Schema.Boolean,
    banned: Schema.NullishOr(Schema.Boolean),
    banReason: Schema.NullishOr(Schema.String),
    banExpires: Schema.NullishOr(Schema.DateTimeUtcFromDate),
  })
) {}

/** Deliberately excludes role and ban fields; those have dedicated commands. */
export class AuthAdminUpdateUserInput extends Schema.Struct({
  userId: AuthUserId,
  name: NameInput,
  username: UsernameInput,
  email: EmailInput,
  image: Schema.NullOr(Schema.String),
}) {}

export class AuthSetUserPasswordInput extends Schema.Struct({
  userId: AuthUserId,
  newPassword: NewPasswordInput,
}) {}
