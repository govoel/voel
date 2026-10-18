import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';

export const serverUserSessionAtom = Atom.family(
  ({
    accountKey,
    userId,
    sessionId,
  }: {
    accountKey: Option.Option<ActiveAccountKey>;
    userId: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    serverUserSessionsAtom({ accountKey, userId }).pipe(
      Atom.mapResult(({ sessions }) =>
        Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
          Option.map((session) => ({
            ...session,
            isOtherUser: Option.isSome(accountKey) && accountKey.value.userId !== userId,
          }))
        )
      )
    )
);
