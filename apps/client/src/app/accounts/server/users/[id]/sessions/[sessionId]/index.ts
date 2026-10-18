import { Array, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';

const serverUserSessionFamily = Atom.family(
  ({
    userId,
    sessionId,
  }: {
    userId: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    serverUserSessionsAtom(userId).pipe(
      Atom.transform((get, source) =>
        AsyncResult.map(
          AsyncResult.all({
            result: get(source),
            activeAccountKey: get(activeAccountKeyAtom),
          }),
          ({ result: { sessions }, activeAccountKey }) =>
            Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
              Option.map((session) => ({
                ...session,
                isOtherUser:
                  Option.isSome(activeAccountKey) && activeAccountKey.value.userId !== userId,
              }))
            )
        )
      )
    )
);

// Caller metadata must not create a second atom for the same user/session.
export const serverUserSessionAtom = ({
  userId,
  sessionId,
}: Parameters<typeof serverUserSessionFamily>[0]) => serverUserSessionFamily({ userId, sessionId });
