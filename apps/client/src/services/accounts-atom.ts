import { Effect, Option, Stream } from 'effect';

import { AccountManager } from './accounts';
import { AppRuntime } from './registry';

export const activeAccountAtom = AppRuntime.atom(
  Stream.unwrap(
    Effect.map(AccountManager, (manager) =>
      manager.changes.pipe(
        Stream.map((state) => Option.map(state.activeAccount, ({ account }) => account))
      )
    )
  )
);
