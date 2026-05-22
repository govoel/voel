import { Effect, Option, pipe } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AccountManager } from './accounts';
import { AppRuntime } from './registry';

const activeAccountWritableAtom = pipe(
  AppRuntime.subscriptionRef(
    pipe(
      AccountManager,
      Effect.map((manager) => manager.stateRef)
    )
  ),
  Atom.mapResult((state) =>
    pipe(
      state.activeAccount,
      Option.map(({ account }) => account)
    )
  )
);

export const activeAccountAtom = Atom.readable((get) => get(activeAccountWritableAtom));
