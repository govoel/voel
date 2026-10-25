import { useAtom } from '@effect/atom-react';
import { Array, Cause, Effect, Exit, Match, Option, Struct } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export const setActiveAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
    AccountManager.use((manager) => manager.setActiveAccount(input))
).pipe(Atom.withLabel('setActiveAccountAtom'));

export const removeAccountAtom = Atom.family((key: AccountKey) =>
  AppRuntime.fn(
    Effect.fnUntraced(function* () {
      const manager = yield* AccountManager;
      yield* manager.removeAccount(key);
      const accounts = yield* AccountRepository.use((repository) => repository.list);
      return { accountsRemain: accounts.length > 0 };
    })
  ).pipe(Atom.withLabel('removeAccountAtom'))
);

export const removeAccountFailureMessage = ({
  error,
}: {
  readonly error: Atom.Failure<ReturnType<typeof removeAccountAtom>>;
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      AccountDatabaseError: () => 'A database error occurred. Try again.',
    })
  );

export const accountsWithActiveAccount = accountsAtom.pipe(
  Atom.mapResult((accounts) => {
    const activeAccount = Array.findFirst(accounts, (account) => account.active).pipe(
      Option.map((account) =>
        Struct.assign(account, { hostname: new URL(account.serverUrl).hostname })
      )
    );

    return { accounts, activeAccount };
  }),
  withPredefinedStates(() => [
    {
      id: PredefinedStateId.make('loading'),
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: PredefinedStateId.make('empty'),
      label: 'No accounts',
      atom: Atom.make(() => AsyncResult.success({ accounts: [], activeAccount: Option.none() })),
    },
    {
      id: PredefinedStateId.make('failure'),
      label: 'Failed to load accounts',
      atom: Atom.make(() =>
        AsyncResult.failure<never>(Cause.die(new Error('Predefined accounts screen failure')))
      ),
    },
  ]),
  Atom.withLabel('accountsWithActiveAccount')
);

export const useSetActiveAccount = () => {
  const [setActiveAccount, setActiveAccountMutation] = useAtom(setActiveAccountAtom, {
    mode: 'promiseExit',
  });

  const selectAccount = async ({
    input,
    onSuccess,
  }: {
    input: Parameters<typeof setActiveAccountMutation>[0];
    onSuccess: () => Promise<void>;
  }) => {
    const result = await setActiveAccountMutation(input);
    if (Exit.isSuccess(result)) {
      await onSuccess();
    }
  };

  return [setActiveAccount, selectAccount] as const;
};
