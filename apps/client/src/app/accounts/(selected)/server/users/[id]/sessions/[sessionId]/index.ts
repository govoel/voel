import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';

export const serverUserSessionAtom = Atom.family(
  ({
    account,
    userId,
    sessionId,
  }: {
    readonly account: AccountKey;
    readonly userId: typeof AuthUser.fields.id.Type;
    readonly sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    serverUserSessionsAtom({ account, userId }).pipe(
      Atom.mapResult(({ sessions }) =>
        Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
          Option.map((session) => ({
            ...session,
            isOtherUser: account.userId !== userId,
          }))
        )
      )
    )
);
