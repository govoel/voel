import { Effect, Option, Queue, Stream } from 'effect';

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
