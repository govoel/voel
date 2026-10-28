import { Atom, Reactivity } from 'effect/reactivity';
import { createContext, useContext } from 'react';

import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export const SelectedAccountContext = createContext<AccountKey | null>(null);

export const useSelectedAccount = () => {
  const account = useContext(SelectedAccountContext);
  if (account === null) {
    throw new Error('useSelectedAccount must be used within a SelectedAccountBoundary');
  }
  return account;
};

export const accountAtom = Atom.family((account: AccountKey) =>
  AppRuntime.atom(
    AccountRepository.use((repository) => repository.findByKey(account)).pipe(
      Reactivity.stream(['account'])
    )
  )
);
