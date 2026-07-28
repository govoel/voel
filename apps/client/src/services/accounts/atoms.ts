import { Effect, Equal, Option, Queue, Stream } from 'effect';
import { Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountsAtom = AppRuntime.atom(
  Effect.service(MainDatabase).pipe(
    Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll())),
    Reactivity.stream(['account'])
  )
).pipe(Atom.withEquality(Equal.equals));

export const activeAccountAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
);

export const activeAccountSessionAtom = AppRuntime.atom((get) => {
  const activeAccount = get.streamResult(activeAccountAtom);

  const changes = Stream.changesWith(activeAccount, (previous, next) =>
    Option.match(previous, {
      onNone: () => Option.isNone(next),
      onSome: (previousActiveAccount) =>
        Option.match(next, {
          onNone: () => false,
          onSome: (nextActiveAccount) =>
            previousActiveAccount.state.authClient === nextActiveAccount.state.authClient,
        }),
    })
  );

  return Stream.switchMap(changes, (newActiveAccount) =>
    Option.match(newActiveAccount, {
      onNone: () => Stream.make(Option.none()),
      onSome: ({ state }) =>
        Stream.callback<
          Option.Option<Parameters<Parameters<typeof state.authClient.useSession.subscribe>[0]>[0]>
        >(
          Effect.fnUntraced(function* (queue) {
            const unsubscribe = yield* Effect.sync(() =>
              state.authClient.useSession.subscribe((session) => {
                Queue.offerUnsafe(queue, Option.some(session));
              })
            );

            yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
          })
        ),
    })
  );
});
