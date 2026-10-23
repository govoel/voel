import { Atom, Reactivity } from 'effect/reactivity';
import { createContext, useContext } from 'react';

import { AccountRepository } from '#src/domains/accounts/repository.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

export const SelectedAccountContext = createContext<ActiveAccountKey | null>(null);

export const useSelectedAccount = () => {
  const account = useContext(SelectedAccountContext);
  if (account === null) {
    throw new Error('useSelectedAccount must be used within a SelectedAccountBoundary');
  }
  return account;
};

export const accountAtom = Atom.family((account: ActiveAccountKey) =>
  AppRuntime.atom(
    AccountRepository.use((repository) => repository.getByStorageKey(account)).pipe(
      Reactivity.stream(['account'])
    )
  )
);
