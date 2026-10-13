import { Array, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';

import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';

const serverUserSessionFamily = Atom.family(
  ({
    account,
    userId,
    sessionId,
  }: {
    readonly account: Option.Option<ActiveAccountKey>;
    readonly userId: typeof AuthUser.fields.id.Type;
    readonly sessionId: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    serverUserSessionsAtom({ account, userId }).pipe(
      Atom.map(
        AsyncResult.map(({ sessions }) =>
          Array.findFirst(sessions, (session) => session.id === sessionId).pipe(
            Option.map((session) => ({
              ...session,
              isOtherUser: Option.isSome(account) && account.value.userId !== userId,
            }))
          )
        )
      )
    )
);

// Caller metadata must not create a second atom for the same account/user/session.
export const serverUserSessionAtom = ({
  account,
  userId,
  sessionId,
}: Parameters<typeof serverUserSessionFamily>[0]) =>
  serverUserSessionFamily({ account, userId, sessionId });
