import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AuthDeviceSession, AuthUser } from '@repo/auth-api/shared.ts';
import { serverUserSessionsAtom } from '#src/app/accounts/server/users/[id]/index.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';



const serverUserSessionFamily = Atom.family(
  ({
    account,
    userId,
    sessionId,
  }: {
    readonly account: AccountStorageKey;
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

// Caller metadata must not create a second atom for the same account/user/session.
export const serverUserSessionAtom = ({
  account,
  userId,
  sessionId,
}: Parameters<typeof serverUserSessionFamily>[0]) =>
  serverUserSessionFamily({ account, userId, sessionId });
