import { Array, Option } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

import { ownSessionsAtom } from '#src/app/accounts/profile/index.ts';
import type { AccountStorageKey } from '#src/services/accounts/index.ts';

const ownSessionFamily = Atom.family(
  ({
    account,
    id,
  }: {
    readonly account: AccountStorageKey;
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

export const ownSessionAtom = ({ account, id }: Parameters<typeof ownSessionFamily>[0]) =>
  ownSessionFamily({ account, id });
