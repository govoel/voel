import { Match } from 'effect';

import type { BetterAuthClientInitializationError } from '@repo/auth-api/client.ts';
import type { AuthError } from '@repo/auth-api/shared.ts';

import type { AccountDatabaseError, AccountNotFoundError } from '#src/domains/accounts/errors.ts';

export const authFailureMessage = ({
  error,
}: {
  error:
    | AuthError
    | AccountDatabaseError
    | BetterAuthClientInitializationError
    | AccountNotFoundError;
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      AccountDatabaseError: () => 'Unable to read the account. Try again.',
      AccountNotFoundError: () => 'The account is no longer available.',
      BetterAuthClientInitializationError: () => 'Unable to initialize authentication. Try again.',
      AuthError: ({ reason }) =>
        Match.value(reason).pipe(
          Match.tagsExhaustive({
            BetterAuthApiError: ({ message }) => message || 'The server rejected this request.',
            AuthTransportError: () =>
              'Unable to reach the server. Check your connection and try again.',
            InvalidAuthInputError: () => 'Check the details and try again.',
            InvalidAuthResponseError: () => 'The server returned an invalid response.',
          })
        ),
    })
  );
