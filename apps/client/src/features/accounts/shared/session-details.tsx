import { DateTime } from 'effect';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { Text } from '#src/components/text';

export const SessionDetails = ({ session }: { session: typeof AuthDeviceSession.Type }) => (
  <>
    <Text>{session.userAgent ?? 'Unknown device'}</Text>
    <Text>IP address: {session.ipAddress ?? 'Unknown'}</Text>
    <Text>Signed in: {DateTime.formatIso(session.createdAt)}</Text>
    <Text>Last updated: {DateTime.formatIso(session.updatedAt)}</Text>
    <Text>Expires: {DateTime.formatIso(session.expiresAt)}</Text>
  </>
);
