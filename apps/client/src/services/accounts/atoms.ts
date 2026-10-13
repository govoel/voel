import { Cause, DateTime, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { AccountManager, NoActiveAccountError } from '#src/services/accounts/index.ts';
import type { ActiveAccountKey } from '#src/services/accounts/index.ts';
import { AccountRepository } from '#src/services/accounts/repository.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { AuthClientMap } from '#src/services/auth-client/index.ts';
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
      id: PredefinedStateId.make('loading'),
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: PredefinedStateId.make('empty'),
      label: 'No accounts',
      atom: Atom.make(() => AsyncResult.success([])),
    },
    {
      id: PredefinedStateId.make('account-available'),
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
      id: PredefinedStateId.make('failure'),
      label: 'Database failure',
      atom: Atom.make(() =>
        AsyncResult.failure<never>(Cause.die(new Error('Predefined accounts database failure')))
      ),
    },
  ]),
  Atom.withEquality(Equal.equals),
  Atom.withLabel('accountsAtom')
);

export const accountAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  Option.match(account, {
    onNone: () => Atom.make(() => AsyncResult.success(Option.none<Account>())),
    onSome: (key) =>
      AppRuntime.atom(
        AccountRepository.pipe(
          Effect.flatMap((repository) => repository.getByStorageKey(key)),
          Reactivity.stream(['account'])
        )
      ),
  })
);

export const activeAccountAtom = Atom.make((get) =>
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- AsyncResult.flatMap is not an array method.
  AsyncResult.flatMap(get(activeAccountKeyAtom), (account) => get(accountAtom(account)))
).pipe(
  withPredefinedStates(() => [
    {
      id: PredefinedStateId.make('loading'),
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: PredefinedStateId.make('none'),
      label: 'No active account',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: PredefinedStateId.make('failure'),
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
).pipe(Atom.withLabel('activeAccountKeyAtom'));

/** Auth client state is owned by the complete account/storage identity, not the active slot. */
export const accountAuthClientAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.atom(
    Effect.gen(function* () {
      if (Option.isNone(account)) {
        return yield* NoActiveAccountError.make();
      }
      return yield* AuthClientMap.use((authClients) => authClients.acquire(account.value));
    })
  )
);
