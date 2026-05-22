import { Effect, Option, Stream } from 'effect';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AppRuntime } from '#src/services/registry.ts';

export const activeAccountAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap,
    Stream.map((accounts) => accounts.activeAccount.pipe(Option.map(({ account }) => account)))
  )
);

export const activeAccountCookiesAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap,
    Stream.map((accounts) => accounts.activeAccount.pipe(Option.map(({ state }) => state.cookie)))
  )
);
