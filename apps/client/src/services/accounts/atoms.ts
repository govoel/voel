import { Cause, Effect, Equal, Option, Queue, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { MainDatabase } from '#src/services/database/main/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountsAtom = AppRuntime.atom(
  Effect.service(MainDatabase).pipe(
    Effect.flatMap((db) => db.execute(db.selectFrom('account').selectAll())),
    Reactivity.stream(['account'])
  )
).pipe(
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      source: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'empty',
      label: 'No accounts',
      source: Atom.make(() => AsyncResult.success([])),
    },
    {
      id: 'account-available',
      label: 'Account available',
      source: Atom.make(() =>
        AsyncResult.success([
          {
            active: Account.fields.active.make(0),
            authStorageId: Account.fields.authStorageId.make('predefined-auth-storage'),
            createdAt: 0,
            profilePicture: null,
            role: Account.fields.role.make('admin'),
            serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
            updatedAt: 0,
            userId: Account.fields.userId.make('predefined-user'),
            username: Account.fields.username.make('alex'),
          },
        ])
      ),
    },
    {
      id: 'failure',
      label: 'Database failure',
      source: Atom.make(() =>
        AsyncResult.failure<never>(Cause.die(new Error('Predefined accounts database failure')))
      ),
    },
  ]),
  Atom.withEquality(Equal.equals),
  Atom.withLabel('accountsAtom')
);

export const activeAccountAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
).pipe(
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      source: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'none',
      label: 'No active account',
      source: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'failure',
      label: 'Account manager failure',
      source: Atom.make(() =>
        AsyncResult.failure<never>(Cause.die(new Error('Predefined active account failure')))
      ),
    },
  ]),
  Atom.withLabel('activeAccountAtom')
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
}).pipe(
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      source: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'none',
      label: 'No active account',
      source: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'failure',
      label: 'Session failure',
      source: Atom.make(() =>
        AsyncResult.failure<never>(
          Cause.die(new Error('Predefined active account session failure'))
        )
      ),
    },
  ]),
  Atom.withLabel('activeAccountSessionAtom')
);
