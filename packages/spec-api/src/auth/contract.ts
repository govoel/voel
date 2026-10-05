import { AuthContract, Password as AuthPassword, Schema as AuthSchema } from '@yielded/auth';
import { Schema } from 'effect';

const DisplayName = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(128)),
  Schema.brand('@repo/spec-api/auth/contract/DisplayName')
);
const Password = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));
const Username = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9_]{1,23}$/u)),
  Schema.brand('@repo/spec-api/auth/contract/Username')
);
const Role = Schema.Literals(['admin', 'user', 'under18']).pipe(
  Schema.brand('@repo/spec-api/auth/contract/Role')
);

class Claims extends Schema.Struct({
  email: AuthSchema.Email,
  username: Username,
  role: Role,
}) {}

export class AlreadyBootstrapped extends Schema.TaggedError<
  AlreadyBootstrapped,
  { readonly brand: unique symbol }
>('@repo/spec-api/auth/contract/AlreadyBootstrapped')('AlreadyBootstrapped', {}) {}

export const AuthApi = AuthContract.make('app/Auth', {
  claims: Claims,
  basePath: '/api/auth',
  actions: (sessions) => ({
    passwordSignIn: AuthContract.action({
      ...AuthContract.passwordSignIn(sessions),
      payload: Schema.Struct({ username: Username, password: Password }),
      replay: 'non-idempotent',
      strategy: 'account',
    }),

    bootstrapServer: AuthContract.action({
      payload: Schema.Struct({
        displayName: DisplayName,
        username: Username,
        email: AuthSchema.Email,
        password: Password,
      }),
      success: Schema.TaggedStruct('BootstrapSuccess', {}),
      error: Schema.Union([
        AlreadyBootstrapped,
        AuthPassword.PasswordRejected,
        AuthPassword.PasswordUnavailable,
        AuthPassword.PasswordActionRequired,
        AuthPassword.PasswordMethodUnsupported,
        AuthPassword.NewPasswordRejected,
        AuthPassword.PasswordCheckUnavailable,
      ]),
      mode: 'mutation',
      replay: 'non-idempotent',
      strategy: 'account',
    }),
  }),
});
