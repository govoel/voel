import { Effect, Match, Option } from 'effect';

import type { AuthChangePasswordInput, AuthError } from '@repo/auth-api/shared.ts';

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
          | 'BetterAuthClientInitializationError';
      };
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      NoActiveAccountError: () => 'No signed-in account is available.',
      AccountDatabaseError: () => 'Unable to read the account. Try again.',
      BetterAuthClientInitializationError: () => 'Unable to initialize authentication. Try again.',
      AuthError: ({ reason }) =>
        Match.value(reason).pipe(
          Match.tagsExhaustive({
            BetterAuthApiError: ({ message }) => message || 'The server rejected this request.',
            AuthTransportError: () =>
              'Unable to reach the server. Check your connection and try again.',
            InvalidAuthInputError: () => 'Check the details and try again.',
            InvalidAuthResponseError: () =>
              'The server returned an invalid response. Refresh before retrying.',
          })
        ),
    })
  );

export const changePasswordAtom = AppRuntime.fn<typeof AuthChangePasswordInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const { client } = yield* get.result(accountAuthAtom);
    yield* client.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
  })
);
