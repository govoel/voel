import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom } from '#src/app/accounts/profile/index.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';

export const ownSessionAtom = Atom.family(
  ({
    accountKey,
    id,
  }: {
    accountKey: Option.Option<ActiveAccountKey>;
    id: typeof AuthDeviceSession.fields.id.Type;
  }) =>
    ownSessionsAtom(accountKey).pipe(
      Atom.mapResult(({ sessions, currentId }) =>
        Array.findFirst(sessions, (session) => session.id === id).pipe(
          Option.map((session) => ({ session, isCurrent: session.id === currentId }))
        )
      )
    )
);
