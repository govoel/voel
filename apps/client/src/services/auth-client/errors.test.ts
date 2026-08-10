import { describe, expect, it } from '@effect/vitest';

import { betterAuthErrorFromUnknown } from '#src/services/auth-client/errors.ts';

describe('betterAuthErrorFromUnknown', () => {
  it('preserves a Better Auth message when provided', () => {
    const error = betterAuthErrorFromUnknown({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
      status: 401,
      statusText: 'Unauthorized',
    });

    expect(error.message).toBe('Invalid username or password');
  });

  it('does not synthesize a missing Better Auth message', () => {
    const error = betterAuthErrorFromUnknown({ status: 500, statusText: 'Internal Server Error' });

    expect(error.message).toBe('');
  });

  it('does not synthesize a message for an unrecognized error', () => {
    const error = betterAuthErrorFromUnknown({ cause: 'unknown' });

    expect(error.message).toBe('');
  });
});
