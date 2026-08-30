import { useAtom } from '@effect/atom-react';
import { Cause, Effect, Exit, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { useAppForm } from '#src/components/form';
import { accountsAtom, activeAccountAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const setActiveAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setActiveAccount(input)))
).pipe(Atom.withLabel('setActiveAccountAtom'));

export const removeAccountAtom = AppRuntime.fn(() =>
  AccountManager.pipe(Effect.flatMap((manager) => manager.removeActiveAccount))
).pipe(Atom.withLabel('removeAccountAtom'));

export const useRemoveAccountForm = ({
  onSuccess,
}: {
  readonly onSuccess: () => Promise<void>;
}) => {
  const form = useAppForm({
    schema: Schema.Void,
    mutation: removeAccountAtom,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          AuthClientStorageRemoveItemError: () => 'Failed to clear account storage. Try again.',
          AccountDatabaseError: () => 'A database error occurred. Try again.',
        })
      ),
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });

  return form;
};

export const accountsWithActiveAccount = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const [accounts, activeAccount] = yield* Effect.all(
      [
        get.result(accountsAtom),
        get.result(activeAccountAtom).pipe(
          Effect.map(
            Option.map((account) => ({
              active: account.active,
              authStorageId: account.authStorageId,
              createdAt: account.createdAt,
              email: account.email,
              hostname: new URL(account.serverUrl).hostname,
              name: account.name,
              profilePicture: account.profilePicture,
              role: account.role,
              serverUrl: account.serverUrl,
              updatedAt: account.updatedAt,
              userId: account.userId,
              username: account.username,
            }))
          )
        ),
      ],
      { concurrency: 'unbounded' }
    );

    return { accounts, activeAccount };
  })
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
      atom: Atom.make(() => AsyncResult.success({ accounts: [], activeAccount: Option.none() })),
    },
    {
      id: 'failure',
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
