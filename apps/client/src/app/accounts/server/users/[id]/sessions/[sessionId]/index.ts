import { Array, Effect, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const serverUserSessionFamily = Atom.family(
  ({
    userId,
    sessionId,
  }: {
    userId: typeof AuthUser.fields.id.Type;
    sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const [{ sessions }, activeAccountKey] = yield* Effect.all(
          [get.result(serverUserSessionsAtom(userId)), get.result(activeAccountKeyAtom)],
          { concurrency: 'unbounded' }
        );
        return Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
          Option.map((session) => ({
            ...session,
            isOtherUser:
              Option.isSome(activeAccountKey) && activeAccountKey.value.userId !== userId,
          }))
        );
      })
    )
);

// Caller metadata must not create a second atom for the same user/session.
export const serverUserSessionAtom = ({
  userId,
  sessionId,
}: Parameters<typeof serverUserSessionFamily>[0]) => serverUserSessionFamily({ userId, sessionId });
