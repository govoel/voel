import { Option, String } from 'effect';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

export const sessionDeviceName = ({
  session,
  isCurrent,
}: {
  readonly session: Pick<typeof AuthDeviceSession.Type, 'userAgent'>;
  readonly isCurrent: boolean;
}) => {
  const name = Option.fromNullishOr(session.userAgent).pipe(
    Option.map(String.trim),
    Option.filter(String.isNonEmpty),
    Option.getOrElse(() => 'Unknown device')
  );
  return `${name}${isCurrent ? ' (This device)' : ''}`;
};
