import { Array, Effect, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/(selected)/server/users/[id]/index.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export const serverUserSessionAtom = Atom.family(
  ({
    account,
    userId,
    sessionId,
  }: {
    readonly account: ActiveAccountKey;
    readonly userId: typeof AuthUser.fields.id.Type;
    readonly sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const { sessions } = yield* get.result(serverUserSessionsAtom({ account, userId }));
        return Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
          Option.map((session) => ({
            ...session,
            isOtherUser: account.userId !== userId,
          }))
        );
      })
    )
);
