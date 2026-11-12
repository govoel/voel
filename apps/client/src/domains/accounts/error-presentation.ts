import { Match, flow } from 'effect';
import type { Effect } from 'effect';

import type { AuthError } from '@repo/auth-api/shared.ts';

import type { AuthClient } from '#src/domains/accounts/auth-client/index.ts';
import type { AccountManager } from '#src/domains/accounts/manager.ts';
import type { AccountRepository } from '#src/domains/accounts/repository.ts';
import { connectionFailureMessage, invalidResponseMessage } from '#src/errors.ts';

// Better Auth normalizes its endpoints to AuthError. Local account operations
// are owned by the complete service contracts, not a list of current UI callers.
type AccountOperation =
  | AccountManager['Service'][keyof AccountManager['Service']]
  | AccountRepository['Service'][keyof AccountRepository['Service']];

type AccountError =
  | AuthError
  | Effect.Error<
      AccountOperation | ReturnType<Extract<AccountOperation, (...args: Array<never>) => unknown>>
    >
  | Effect.Error<ReturnType<typeof AuthClient.make>>;

const authReasonMessage = Match.type<AuthError['reason']>().pipe(
  Match.tagsExhaustive({
    BetterAuthApiError: ({ message }) => message || 'The server rejected this request.',
    AuthTransportError: () => connectionFailureMessage,
    InvalidAuthInputError: () => 'Check the details and try again.',
    InvalidAuthResponseError: () => invalidResponseMessage,
  })
);

export const accountFailureMessage = flow(
  ({ error }: { readonly error: AccountError }) => error,
  Match.type<AccountError>().pipe(
    Match.tagsExhaustive({
      AccountDatabaseError: () => 'Unable to read or save the account. Try again.',
      AccountCredentialsError: () => 'Unable to securely read or save credentials. Try again.',
      AccountNotFoundError: () => 'The account is no longer available.',
      BetterAuthClientInitializationError: () => 'Unable to initialize authentication. Try again.',
      AuthError: ({ reason }) => authReasonMessage(reason),
      AccountSignInError: ({ reason }) => authReasonMessage(reason),
      AccountSignUpError: ({ reason }) => authReasonMessage(reason),
    })
  )
);
