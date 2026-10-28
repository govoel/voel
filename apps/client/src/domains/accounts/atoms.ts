import { Cause, DateTime, Effect, Equal } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { Account, AccountRepository } from '#src/domains/accounts/repository.ts';
import { AccountKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export const accountsAtom = AppRuntime.atom(
  Effect.service(AccountRepository).pipe(
    Effect.flatMap((repository) => repository.list),
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
          Account.make({
            key: AccountKey.make({
              serverUrl: AccountKey.fields.serverUrl.make('https://voel.example.com'),
              userId: AccountKey.fields.userId.make('predefined-user'),
            }),
            active: Account.fields.active.make(false),
            createdAt: DateTime.makeUnsafe(0),
            updatedAt: DateTime.makeUnsafe(0),
            email: Account.fields.email.make('alex@example.com'),
            name: Account.fields.name.make('Alex Reader'),
            profilePicture: Account.fields.profilePicture.make(null),
            role: Account.fields.role.make('admin'),
            username: Account.fields.username.make('alex'),
          }),
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
