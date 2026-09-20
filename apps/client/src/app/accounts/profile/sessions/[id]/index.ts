import { Array, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom } from '#src/app/accounts/profile/index.ts';

export const ownSessionAtom = Atom.family((id: typeof AuthDeviceSession.fields.id.Type) =>
  ownSessionsAtom.pipe(
    Atom.map(
      AsyncResult.map(({ sessions, currentId }) =>
        Array.findFirst(sessions, (session) => session.id === id).pipe(
          Option.map((session) => ({ session, isCurrent: session.id === currentId }))
        )
      )
    )
  )
);
