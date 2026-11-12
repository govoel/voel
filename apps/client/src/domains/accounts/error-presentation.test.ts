import { describe, expect, it } from 'vitest';

import { BetterAuthClientInitializationError } from '@repo/auth-api/client.ts';
import {
  AuthError,
  AuthTransportError,
  BetterAuthApiError,
  InvalidAuthInputError,
  InvalidAuthResponseError,
} from '@repo/auth-api/shared.ts';

import { accountFailureMessage } from '#src/domains/accounts/error-presentation.ts';
import {
  AccountCredentialsError,
  AccountDatabaseError,
  AccountNotFoundError,
  AccountSignInError,
  AccountSignUpError,
} from '#src/domains/accounts/errors.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';

describe('account error presentation', () => {
  it.each([
    {
      reason: AuthTransportError.make({ cause: new Error('private transport details') }),
      message: 'Unable to reach the server. Check your connection and try again.',
    },
    {
      reason: InvalidAuthResponseError.make(),
      message: 'The server returned an invalid response. Try again.',
    },
    { reason: InvalidAuthInputError.make(), message: 'Check the details and try again.' },
    {
      reason: BetterAuthApiError.make({
        code: 'USERNAME_ALREADY_TAKEN',
        message: 'Username is already taken',
        status: 422,
        statusText: 'Unprocessable Entity',
      }),
      message: 'Username is already taken',
    },
    {
      reason: BetterAuthApiError.make({ code: 'UNKNOWN', status: 400, statusText: 'Bad Request' }),
      message: 'The server rejected this request.',
    },
  ])(
    'shares auth reason copy across management, sign-in and setup: $reason._tag',
    ({ reason, message }) => {
      for (const error of [
        AuthError.make({ reason }),
        AccountSignInError.make({ reason }),
        AccountSignUpError.make({ reason }),
      ]) {
        expect(accountFailureMessage({ error })).toBe(message);
      }
    }
  );

  it('keeps local failures actionable without exposing diagnostic causes', () => {
    const cause = new Error('private database path, credentials and initialization details');
    expect(accountFailureMessage({ error: AccountDatabaseError.make({ cause }) })).toBe(
      'Unable to read or save the account. Try again.'
    );
    expect(accountFailureMessage({ error: AccountCredentialsError.make({ cause }) })).toBe(
      'Unable to securely read or save credentials. Try again.'
    );
    expect(
      accountFailureMessage({ error: BetterAuthClientInitializationError.make({ error: cause }) })
    ).toBe('Unable to initialize authentication. Try again.');
    expect(
      accountFailureMessage({
        error: AccountNotFoundError.make(
          AccountKey.make({
            serverUrl: AccountKey.fields.serverUrl.make('https://example.com'),
            userId: AccountKey.fields.userId.make('missing'),
          })
        ),
      })
    ).toBe('The account is no longer available.');
  });
});
