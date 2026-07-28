import { useAtom } from '@effect/atom-react';
import { Effect, Exit, Option } from 'effect';

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
