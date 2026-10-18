import { Match } from 'effect';

import type { BetterAuthClientInitializationError } from '@repo/auth-api/client.ts';
import type { AuthError } from '@repo/auth-api/shared.ts';

import type { AuthClientStorageRemoveItemError } from '#src/domains/accounts/auth-client/storage.ts';
import type { AccountDatabaseError } from '#src/domains/accounts/errors.ts';

export const authFailureMessage = ({
  error,
}: {
  error:
    | AuthError
    | AccountDatabaseError
    | BetterAuthClientInitializationError
    | AuthClientStorageRemoveItemError;
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      AccountDatabaseError: () => 'Unable to read the account. Try again.',
      AuthClientStorageRemoveItemError: () => 'Unable to clear account storage. Try again.',
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
