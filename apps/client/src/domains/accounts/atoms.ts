import { Cause, Effect, Equal, Schema } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { AccountRepository } from '#src/domains/accounts/repository.ts';
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
      atom: Atom.make(
        // Predefined rendering data is decoded like an encoded database row.
        Schema.decodeEffect(AccountRepository.fromRow)({
          active: 0,
          createdAt: 0,
          updatedAt: 0,
          email: 'alex@example.com',
          name: 'Alex Reader',
          profilePicture: null,
          role: 'admin',
          serverUrl: 'https://voel.example.com',
          userId: 'predefined-user',
          username: 'alex',
        }).pipe(
          Effect.map((account) => [account]),
          Effect.orDie
        )
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
