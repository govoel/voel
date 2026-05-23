import { Effect, Option, Queue, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AppRuntime } from '#src/services/registry.ts';

const accountsAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
);

export type AccountsSheetMode = 'ONBOARDING' | 'MUST_PICK_ACCOUNT' | 'INVALID_SESSION' | 'IDLE';

export interface AccountsSheet {
  readonly mode: AccountsSheetMode;
  readonly dismissable: boolean;
}

export const activeAccountServerUrlAtom = accountsAtom.pipe(
  Atom.mapResult((accounts) =>
    accounts.activeAccount.pipe(Option.map(({ account }) => account.serverUrl))
  )
);

export const activeAccountSessionAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap,
    Stream.map((accounts) =>
      accounts.activeAccount.pipe(Option.map(({ state }) => state.authClient))
    ),
    Stream.changesWith((previous, next) =>
      Option.match(previous, {
        onNone: () => Option.isNone(next),
        onSome: (previousAuthClient) =>
          Option.match(next, {
            onNone: () => false,
            onSome: (nextAuthClient) => previousAuthClient === nextAuthClient,
          }),
      })
    ),
    Stream.switchMap((authClientOption) =>
      authClientOption.pipe(
        Option.match({
          onNone: () => Stream.make(Option.none()),
          onSome: (authClient) =>
            Stream.callback<
              Option.Option<Parameters<Parameters<typeof authClient.useSession.subscribe>[0]>[0]>
            >((queue) =>
              Effect.sync(() =>
                authClient.useSession.subscribe((session) => {
                  Queue.offerUnsafe(queue, Option.some(session));
                })
              ).pipe(
                Effect.tap((unsubscribe) => Effect.addFinalizer(() => Effect.sync(unsubscribe)))
              )
            ),
        })
      )
    )
  )
);

type ActiveAccountSession = Atom.Success<typeof activeAccountSessionAtom>;

const getAccountsSheet = ({
  accounts,
  activeAccountSession,
}: {
  readonly accounts: Atom.Success<typeof accountsAtom>;
  readonly activeAccountSession: ActiveAccountSession;
}): AccountsSheet => {
  if (accounts.accounts.length === 0) {
    return { mode: 'ONBOARDING', dismissable: false };
  }

  if (Option.isNone(accounts.activeAccount)) {
    return { mode: 'MUST_PICK_ACCOUNT', dismissable: false };
  }

  if (
    Option.isNone(activeAccountSession) ||
    activeAccountSession.value.error !== null ||
    activeAccountSession.value.data === null
  ) {
    return { mode: 'INVALID_SESSION', dismissable: true };
  }

  return { mode: 'IDLE', dismissable: true };
};

export const accountsSheetAtom = AppRuntime.atom((get) =>
  Effect.gen(function* () {
    const accounts = yield* get.result(accountsAtom);
    const activeAccountSession = yield* get.result(activeAccountSessionAtom);

    return getAccountsSheet({ accounts, activeAccountSession });
  })
);
