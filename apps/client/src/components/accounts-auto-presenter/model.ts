import { Effect, Equal, Option } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  accountsAtom,
  activeAccountAtom,
  activeAccountSessionAtom,
} from '#src/services/accounts/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountsSheetAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const accounts = yield* get.result(accountsAtom);

    if (accounts.length === 0) {
      return { mode: 'ONBOARDING', dismissable: false } as const;
    }

    const activeAccount = yield* get.result(activeAccountAtom);
    if (Option.isNone(activeAccount)) {
      return { mode: 'MUST_PICK_ACCOUNT', dismissable: false } as const;
    }

    const activeAccountSession = yield* get.result(activeAccountSessionAtom);
    if (
      Option.isSome(activeAccountSession) &&
      !activeAccountSession.value.isPending /* nothing in-flight while there is no session */ &&
      activeAccountSession.value.error === null /* no error hitting the server */ &&
      activeAccountSession.value.data === null /* no session of any kind */
    ) {
      return { mode: 'INVALID_SESSION', dismissable: true } as const;
    }

    return { mode: 'IDLE', dismissable: true } as const;
  })
).pipe(Atom.withEquality(Equal.equals));
