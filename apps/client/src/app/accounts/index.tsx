import { useAtom } from '@effect/atom-react';
import { Effect, Exit, Option } from 'effect';

import {
  accountsAtom,
  activeAccountAtom,
  setActiveAccountAtom,
} from '#src/services/accounts/atoms.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/registry.ts';

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

  const setActiveAccountAndDismiss = async (
    input: Parameters<typeof setActiveAccountMutation>[0],
    onSuccess: () => void
  ) => {
    const result = await setActiveAccountMutation(input);
    if (Exit.isSuccess(result)) {
      onSuccess();
    }
  };

  return [setActiveAccount, setActiveAccountAndDismiss] as const;
};
