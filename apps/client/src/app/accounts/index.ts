import { useAtom } from '@effect/atom-react';
import { Effect, Exit, Match, Option, Schema } from 'effect';

import { useAppForm } from '#src/components/form';
import { accountsAtom, activeAccountAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export const setActiveAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.setActiveAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.setActiveAccount(input)))
);

export const removeAccountAtom = AppRuntime.fn(
  (input: Parameters<typeof AccountManager.Service.removeAccount>[0]) =>
    AccountManager.pipe(Effect.flatMap((manager) => manager.removeAccount(input)))
);

class RemoveAccountInput extends Schema.Class<
  RemoveAccountInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/index/RemoveAccountInput')({
  serverUrl: Account.fields.serverUrl,
  userId: Account.fields.userId,
}) {}

export const useRemoveAccountForm = ({
  defaultValues,
  onSuccess,
}: {
  readonly defaultValues: typeof RemoveAccountInput.Encoded;
  readonly onSuccess: () => Promise<void>;
}) => {
  const form = useAppForm({
    schema: RemoveAccountInput,
    mutation: removeAccountAtom,
    defaultValues,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          BetterAuthClientInitializationError: () =>
            'Unexpected error while removing the account. Try again.',
          AccountSignOutError: (signOutError) =>
            signOutError.details.message ?? 'Failed to sign out. Try again.',
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
            Option.map((a) => ({
              ...a,
              account: { ...a.account, hostname: new URL(a.account.serverUrl).hostname },
            }))
          )
        ),
      ],
      { concurrency: 'unbounded' }
    );

    return { accounts, activeAccount };
  })
);

export const activeAccountLiteral = Account.fields.active.make(1);

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
