import { useAtom } from '@effect/atom-react';
import { Array, Cause, Effect, Equal, Exit, Match, Option } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';
import { PredefinedStateId } from '@repo/effect-atom-devtools-core';
import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountStorageKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';



export const setActiveAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setActiveAccount(input)))
).pipe(Atom.withLabel('setActiveAccountAtom'));

export const removeAccountAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.fn(() =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.removeAccount(account)))
  ).pipe(Atom.withLabel('removeAccountAtom'))
);

export const removeAccountFailureMessage = ({
  error,
}: {
  readonly error: Atom.Failure<ReturnType<typeof removeAccountAtom>>;
}) =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      AuthClientStorageRemoveItemError: () => 'Failed to clear account storage. Try again.',
      AccountDatabaseError: () => 'A database error occurred. Try again.',
    })
  );

export const accountsWithActiveAccount = Atom.family((accountKey: AccountStorageKey) =>
  Atom.readable(
    (get) =>
      AsyncResult.map(get(accountsAtom), (accounts) => ({
        accounts,
        activeAccount: Array.findFirst(accounts, (account) =>
          Equal.equals(AccountStorageKey.make(account), accountKey)
        ),
      })),
    (refresh) => {
      refresh(accountsAtom);
    }
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
  )
);

export const useSetActiveAccount = () => {
  const [setActiveAccount, setActiveAccountMutation] = useAtom(setActiveAccountAtom, {
    mode: 'promiseExit',
  });

  const setActiveAccountAndDismiss = async ({
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

  return [setActiveAccount, setActiveAccountAndDismiss] as const;
};
