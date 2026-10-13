import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom } from '#src/app/accounts/profile/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';

export const ownSessionAtom = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: Option.Option<ActiveAccountKey>;
    readonly id: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    ownSessionsAtom(account).pipe(
      Atom.mapResult(({ sessions, currentId }) =>
        Array.findFirst(sessions, (session) => session.id === id).pipe(
          Option.map((session) => ({ session, isCurrent: session.id === currentId }))
        )
      )
    )
);
