import { Cause, DateTime, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/unstable/reactivity';

import { AccountManager } from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const accountsAtom = AppRuntime.atom(
  Effect.service(AccountRepository).pipe(
    Effect.flatMap((repository) => repository.list()),
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
            active: Account.fields.active.make(false),
            authStorageId: Account.fields.authStorageId.make('predefined-auth-storage'),
            createdAt: DateTime.makeUnsafe(0),
            email: Account.fields.email.make('alex@example.com'),
            name: Account.fields.name.make('Alex Reader'),
            profilePicture: Account.fields.profilePicture.make(null),
            role: Account.fields.role.make('admin'),
            serverUrl: Account.fields.serverUrl.make('https://voel.example.com'),
            updatedAt: DateTime.makeUnsafe(0),
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

export const activeAccountAtom = AppRuntime.atom((get) =>
  Stream.switchMap(
    get.streamResult(activeAccountKeyAtom),
    Option.match({
      onNone: () => Stream.make(Option.none()),
      onSome: ({ authStorageId, serverUrl, userId }) =>
        AccountRepository.pipe(
          Effect.flatMap((repository) =>
            repository.getByStorageKey({ serverUrl, authStorageId, userId })
          ),
          Reactivity.stream(['account'])
        ),
    })
  )
).pipe(
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
      label: 'Active account database failure',
      atom: Atom.make(() =>
        AsyncResult.failure<never>(
          Cause.die(new Error('Predefined active account database failure'))
        )
      ),
    },
  ]),
  Atom.withLabel('activeAccountAtom')
);

export const activeAccountKeyAtom = AppRuntime.atom(
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
  Atom.withLabel('activeAccountKeyAtom')
);
