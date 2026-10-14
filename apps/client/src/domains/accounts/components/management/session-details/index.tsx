import { DateTime, Predicate, String } from 'effect';
import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';
import { DetailRows } from '#src/components/detail-rows';
import { sessionDeviceName } from '#src/domains/accounts/components/management/session-details/device-name.ts';



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
        value: sessionDeviceName({ session, isCurrent }),
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
