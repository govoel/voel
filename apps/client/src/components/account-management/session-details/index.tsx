import { DateTime } from 'effect';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { DetailRows } from '#src/components/detail-rows';

export const SessionDetails = ({
  session,
}: {
  readonly session: typeof AuthDeviceSession.Type;
}) => (
  <DetailRows
    details={[
      { label: 'Device', value: session.userAgent ?? 'Unknown device' },
      { label: 'IP address', value: session.ipAddress ?? 'Unknown' },
      { label: 'Signed in', value: DateTime.formatIso(session.createdAt) },
      { label: 'Last updated', value: DateTime.formatIso(session.updatedAt) },
      { label: 'Expires', value: DateTime.formatIso(session.expiresAt) },
    ]}
  />
);
