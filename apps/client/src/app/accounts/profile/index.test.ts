import { DateTime, Exit, Redacted, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  PasswordResetInput,
  getUserSessionDetails,
  getUserSessionTitle,
} from '#src/app/accounts/profile/index.ts';
import type { UserSession } from '#src/app/accounts/profile/index.ts';

vi.mock('#src/components/form', () => ({ useAppForm: vi.fn() }));

const session: UserSession = {
  id: 'session-id',
  token: 'session-token',
  userId: 'user-id',
  createdAt: DateTime.makeUnsafe('2026-07-20T12:00:00.000Z').pipe(DateTime.toDateUtc),
  updatedAt: DateTime.makeUnsafe('2026-07-20T12:00:00.000Z').pipe(DateTime.toDateUtc),
  expiresAt: DateTime.makeUnsafe('2026-08-20T12:00:00.000Z').pipe(DateTime.toDateUtc),
  ipAddress: '192.0.2.1',
  userAgent: 'Voel on iPhone',
};

describe('PasswordResetInput', () => {
  it('decodes matching passwords into redacted values', () => {
    const result = Schema.decodeUnknownExit(PasswordResetInput)({
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
      revokeOtherSessions: true,
    });

    expect(Exit.isSuccess(result)).toBe(true);
    if (Exit.isSuccess(result)) {
      expect(Redacted.value(result.value.currentPassword)).toBe('old-password');
      expect(Redacted.value(result.value.newPassword)).toBe('new-password');
      expect(result.value.revokeOtherSessions).toBe(true);
    }
  });

  it('rejects a short or mismatched new password', () => {
    const shortPassword = Schema.decodeUnknownExit(PasswordResetInput)({
      currentPassword: 'old-password',
      newPassword: 'short',
      confirmPassword: 'short',
      revokeOtherSessions: false,
    });
    const mismatchedPassword = Schema.decodeUnknownExit(PasswordResetInput)({
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'different-password',
      revokeOtherSessions: false,
    });

    expect(String(shortPassword)).toContain('Password must be at least 8 characters');
    expect(String(mismatchedPassword)).toContain('Passwords do not match');
  });
});

describe('user session labels', () => {
  it('identifies the current session and describes session metadata', () => {
    expect(getUserSessionTitle(session, session.token)).toBe('This device');
    expect(getUserSessionTitle(session, 'another-token')).toBe('Voel on iPhone');
    expect(getUserSessionDetails(session)).toContain('IP 192.0.2.1');
  });

  it('falls back when a device does not provide a user agent', () => {
    expect(
      getUserSessionTitle({ ...session, token: 'other-token', userAgent: null }, session.token)
    ).toBe('Unknown device');
  });
});
