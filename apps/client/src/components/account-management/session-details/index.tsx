import { DateTime, Predicate, String } from 'effect';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { DetailRows } from '#src/components/detail-rows';

export const SessionDetails = ({
  session,
  isCurrent,
}: {
  readonly session: typeof AuthDeviceSession.Type;
  readonly isCurrent: boolean;
}) => (
  <DetailRows
    details={[
      {
        label: 'Device',
        value: `${
          Predicate.isString(session.userAgent) && String.isNonEmpty(session.userAgent)
            ? session.userAgent
            : 'Unknown device'
        }${isCurrent ? ' (This device)' : ''}`,
      },
      {
        label: 'IP address',
        value:
          Predicate.isString(session.ipAddress) && String.isNonEmpty(session.ipAddress)
            ? session.ipAddress
            : 'Unknown',
      },
      {
        label: 'Signed in',
        value: DateTime.formatLocal(session.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
      },
      {
        label: 'Last updated',
        value: DateTime.formatLocal(session.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }),
      },
      {
        label: 'Expires',
        value: DateTime.formatLocal(session.expiresAt, { dateStyle: 'medium', timeStyle: 'short' }),
      },
    ]}
  />
);
