import { Effect, Option, Stream } from 'effect';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AppRuntime } from '#src/services/registry.ts';

export const activeAccountServerUrlAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap,
    Stream.map((accounts) =>
      accounts.activeAccount.pipe(Option.map(({ account }) => account.serverUrl))
    )
  )
);

export const activeAccountSessionAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap,
    Stream.map((accounts) =>
      accounts.activeAccount.pipe(Option.map(({ state }) => state.authClient))
    )
  )
);
