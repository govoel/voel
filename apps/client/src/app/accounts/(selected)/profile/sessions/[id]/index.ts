import { Array, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom } from '#src/app/accounts/(selected)/profile/index.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';

export const ownSessionAtom = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: Atom.Atom<ActiveAccountKey>;
    readonly id: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    ownSessionsAtom(account).pipe(
      Atom.map(
        AsyncResult.map(({ sessions, currentId }) =>
          Array.findFirst(sessions, (session) => session.id === id).pipe(
            Option.map((session) => ({ session, isCurrent: session.id === currentId }))
          )
        )
      )
    )
);
