import { Match } from 'effect';
import type { Effect } from 'effect';

import type { AuthClient, AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import type { AccountManager } from '#src/domains/accounts/manager.ts';
import { connectionFailureMessage, invalidResponseMessage } from '#src/errors.ts';

// Operations own the error algebra; presentation does not maintain a second registry.
type AccountFailure =
  | Effect.Error<
      ReturnType<
        AccountManager['Service'][
          | 'signInAccount'
          | 'setupServerWithAccount'
          | 'setActiveAccount'
          | 'removeAccount'
          | 'signOutEverywhere']
      >
    >
  | Effect.Error<ReturnType<AuthClientMap['Service']['acquire']>>
  | Effect.Error<AuthClient['Service']['readSession']>;

const authReasonMessage = Match.type<
  Extract<AccountFailure, { readonly reason: unknown }>['reason']
>().pipe(
  Match.tagsExhaustive({
    BetterAuthApiError: ({ message }) => message || 'The server rejected this request.',
    AuthTransportError: () => connectionFailureMessage,
    InvalidAuthInputError: () => 'Check the details and try again.',
    InvalidAuthResponseError: () => invalidResponseMessage,
  })
);

export const accountFailureMessage = ({ error }: { readonly error: AccountFailure }) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      AccountDatabaseError: () => 'Unable to read or save the account. Try again.',
      AccountCredentialsError: () => 'Unable to securely read or save credentials. Try again.',
      AccountNotFoundError: () => 'The account is no longer available.',
      BetterAuthClientInitializationError: () => 'Unable to initialize authentication. Try again.',
      AuthError: ({ reason }) => authReasonMessage(reason),
      AccountSignInError: ({ reason }) => authReasonMessage(reason),
      AccountSignUpError: ({ reason }) => authReasonMessage(reason),
    })
  );
