import { Effect, Match, Option } from 'effect';

import type { AuthError } from '@repo/auth-api/shared.ts';

import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { NoActiveAccountError } from '#src/services/accounts/index.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountAuthAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const key = yield* get.result(activeAccountKeyAtom);
    if (Option.isNone(key)) {
      return yield* NoActiveAccountError.make();
    }
    return { key: key.value, client: yield* acquireAuthClient(key.value) };
  })
);

export const authFailureMessage = ({
  error,
}: {
  error:
    | AuthError
    | {
        readonly _tag:
          | 'NoActiveAccountError'
          | 'AccountDatabaseError'
          | 'BetterAuthClientInitializationError'
          | 'AuthClientStorageRemoveItemError';
      };
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      NoActiveAccountError: () => 'No signed-in account is available.',
      AccountDatabaseError: () => 'Unable to read the account. Try again.',
      AuthClientStorageRemoveItemError: () => 'Unable to clear account storage. Try again.',
      BetterAuthClientInitializationError: () => 'Unable to initialize authentication. Try again.',
      AuthError: ({ reason }) =>
        authReasonMessage({
          reason,
          rejected: 'The server rejected this request.',
          invalidInput: 'Check the details and try again.',
          invalidResponse: 'The server returned an invalid response. Refresh before retrying.',
        }),
    })
  );

export const authReasonMessage = ({
  reason,
  rejected,
  invalidInput,
  invalidResponse,
}: {
  readonly reason: AuthError['reason'];
  readonly rejected: string;
  readonly invalidInput: string;
  readonly invalidResponse: string;
}) =>
  Match.value(reason).pipe(
    Match.tagsExhaustive({
      BetterAuthApiError: ({ message }) => message || rejected,
      AuthTransportError: () => 'Unable to reach the server. Check your connection and try again.',
      InvalidAuthInputError: () => invalidInput,
      InvalidAuthResponseError: () => invalidResponse,
    })
  );
