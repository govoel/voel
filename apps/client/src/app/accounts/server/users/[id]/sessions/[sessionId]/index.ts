import { Array, Effect, Option } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import { activeAccountKeyAtom } from '#src/services/accounts/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const serverUserSessionAtom = Atom.family(
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
