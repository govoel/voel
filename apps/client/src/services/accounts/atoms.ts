import { Cause, Effect, Equal, Option, Stream } from 'effect';
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
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'empty',
      label: 'No accounts',
      atom: Atom.make(() => AsyncResult.success([])),
    },
    {
      id: 'account-available',
      label: 'Account available',
      atom: Atom.make(() =>
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
      atom: Atom.make(() =>
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
  (source) =>
    AppRuntime.atom((get) =>
      get
        .result(source)
        .pipe(
          Effect.catchTag('NoSuchElementError', () =>
            Effect.succeed<Atom.Success<typeof source>>(Option.none())
          )
        )
    ),
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'none',
      label: 'No active account',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'failure',
      label: 'Account manager failure',
      atom: Atom.make(() =>
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
      onSome: ({ state }) => state.authClient.sessionChanges.pipe(Stream.map(Option.some)),
    })
  );
}).pipe(
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'none',
      label: 'No active account',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'failure',
      label: 'Session failure',
      atom: Atom.make(() =>
        AsyncResult.failure<never>(
          Cause.die(new Error('Predefined active account session failure'))
        )
      ),
    },
  ]),
  Atom.withLabel('activeAccountSessionAtom')
);
