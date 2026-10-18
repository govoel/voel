import { Cause, DateTime, Effect, Equal, Option, Stream } from 'effect';
import { AsyncResult, Atom, Reactivity } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { NoActiveAccountError } from '#src/domains/accounts/errors.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account, ActiveAccountKey } from '#src/domains/accounts/schema.ts';
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

/** Select account-owned state without giving the selector its own async history. */
export const accountScoped = <A, E>(
  make: (key: Option.Option<ActiveAccountKey>) => Atom.Atom<AsyncResult.AsyncResult<A, E>>
) => {
  const family = Atom.family(make);
  const refreshSignal = Atom.make(() => Symbol('refresh active account query'));
  // Keep selection/refresh lifetime independent of query updates. Refreshing a
  // child must not replace the listener while the refresh signal is notifying it.
  const selection = Atom.make((get) => {
    const key = get(activeAccountKeyAtom);
    if (AsyncResult.isInitial(key)) {
      return {
        _tag: 'Unavailable',
        result: AsyncResult.initial<A, E | Atom.Failure<typeof activeAccountKeyAtom>>(key.waiting),
      } as const;
    }
    if (AsyncResult.isFailure(key)) {
      // Identity failures must not carry the previous account into a new query.
      return {
        _tag: 'Unavailable',
        result: AsyncResult.failure<A, E | Atom.Failure<typeof activeAccountKeyAtom>>(key.cause),
      } as const;
    }
    const scoped = family(Option.map(key.value, (value) => ActiveAccountKey.make(value)));
    get.subscribe(refreshSignal, () => {
      get.refresh(scoped);
    });
    return { _tag: 'Selected', atom: scoped } as const;
  });

  return Atom.readable(
    (get) => {
      const selected = get(selection);
      return selected._tag === 'Selected' ? get(selected.atom) : selected.result;
    },
    (refresh) => {
      refresh(refreshSignal);
    }
  );
};

export const accountAuthClientAtom = Atom.family((key: Option.Option<ActiveAccountKey>) =>
  AppRuntime.atom(
    Effect.gen(function* () {
      if (Option.isNone(key)) {
        return yield* NoActiveAccountError.make();
      }
      return yield* AuthClientMap.use((authClients) => authClients.acquire(key.value));
    })
  )
);

/** Mutations resolve persisted identity at invocation, not a cached client's previous result. */
export const acquireActiveAccountAuthClient = Effect.gen(function* () {
  const manager = yield* AccountManager;
  const key = yield* manager.state;
  if (Option.isNone(key)) {
    return yield* NoActiveAccountError.make();
  }
  return yield* AuthClientMap.use((authClients) => authClients.acquire(key.value));
});

export const activeAccountAtom = accountScoped((key) =>
  AppRuntime.atom(
    Option.match(key, {
      onNone: () => Stream.make(Option.none<Account>()),
      onSome: (accountKey) =>
        AccountRepository.pipe(
          Effect.flatMap((repository) => repository.getByStorageKey(accountKey)),
          Reactivity.stream(['account'])
        ),
    })
  )
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
