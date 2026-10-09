import { AuthContract, Schema as AuthSchema, Password } from '@yielded/auth';
import { Schema } from 'effect';

const DisplayName = Schema.NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(128)),
  Schema.brand('@repo/spec-api/auth/contract/DisplayName')
);
const Role = Schema.Literals(['admin', 'user', 'under18']).pipe(
  Schema.brand('@repo/spec-api/auth/contract/Role')
);
class Claims extends Schema.Struct({
  displayName: DisplayName,
  email: AuthSchema.Email,
  role: Role,
}) {}
class Registration extends Schema.Struct({ displayName: DisplayName }) {}

const contract = AuthContract.make('app/Auth', {
  claims: Claims,
  basePath: '/api/auth',
  actions: (sessions) => ({
    passwordSignIn: AuthContract.passwordSignIn(sessions, { strategy: 'password' }),
    bootstrapServer: AuthContract.action({
      payload: Schema.Struct({
        requestId: Password.PasswordCommandId,
        email: AuthSchema.Email,
        newPassword: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
        registration: Registration,
      }),
      // Accepted is not a creation receipt: existing-email suppression is intentional.
      // Clients can offer login afterward; registration does not establish a session.
      success: Schema.TaggedStruct('RegistrationAccepted', {}),
      error: Schema.Union([
        Password.PasswordRejected,
        Password.PasswordUnavailable,
        Password.PasswordActionRequired,
        Password.PasswordMethodUnsupported,
        Password.NewPasswordRejected,
        Password.PasswordCheckUnavailable,
      ]),
      mode: 'mutation',
      replay: 'idempotent',
      strategy: 'password',
      method: 'register',
    }),
  }),
});

// Explicit transport boundary: never expose the installed password management group.
export const AuthApi = {
  ...contract,
  actions: {
    bootstrapServer: contract.actions.bootstrapServer,
    passwordSignIn: contract.actions.passwordSignIn,
    getSession: contract.actions.getSession,
    requireSession: contract.actions.requireSession,
    renewSession: contract.actions.renewSession,
    signOut: contract.actions.signOut,
  },
} satisfies AuthContract.AnyAuthContract;
