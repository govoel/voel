import { Cause, DateTime, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { NoActiveAccountError } from '#src/domains/accounts/errors.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
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

export const activeAccountKeyAtom = AppRuntime.atom(
  AccountManager.pipe(
    Effect.map((manager) => manager.changes),
    Stream.unwrap
  )
).pipe(
  (source) =>
    AppRuntime.atom((get) =>
      get.result(source).pipe(
        Effect.catchTags({
          NoSuchElementError: () => Effect.succeed<Atom.Success<typeof source>>(Option.none()),
        })
      )
    ),
  Atom.withLabel('activeAccountKeyAtom')
);

export const acquireAccountAuthClient = (key: Option.Option<ActiveAccountKey>) =>
  Effect.gen(function* () {
    if (Option.isNone(key)) {
      return yield* NoActiveAccountError.make();
    }
    return yield* AuthClientMap.use((authClients) => authClients.acquire(key.value));
  });

/** Mutations resolve persisted identity at invocation, not a cached client's previous result. */
export const acquireActiveAccountAuthClient = Effect.gen(function* () {
  const manager = yield* AccountManager;
  const key = yield* manager.state;
  return yield* acquireAccountAuthClient(key);
});

export const accountAtom = Atom.family((key: Option.Option<ActiveAccountKey>) =>
  AppRuntime.atom(
    Option.match(key, {
      onNone: () => Stream.make(Option.none<Account>()),
      onSome: (accountKey) =>
        AccountRepository.pipe(
          Effect.flatMap((repository) => repository.getByStorageKey(accountKey)),
          Reactivity.stream(['account'])
        ),
    })
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
    Atom.withLabel('accountAtom')
  )
);
