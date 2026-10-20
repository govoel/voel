import { useAtomSuspense } from '@effect/atom-react';
import type { PropsWithChildren, ReactNode } from 'react';

import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { InlineAccountPicker } from '#src/domains/accounts/components/account-picker';
import { SelectedAccountBoundary } from '#src/domains/accounts/components/selected-account-boundary';
import { Welcome } from '#src/domains/accounts/components/welcome';

// Account changes replace base content, not the root route or its presented modals.
export const MainShell = ({ children }: PropsWithChildren): ReactNode => {
  const accounts = useAtomSuspense(accountsAtom);
  return accounts.value.length === 0 ? (
    <Welcome />
  ) : (
    <SelectedAccountBoundary fallback={<InlineAccountPicker accounts={accounts.value} />}>
      {children}
    </SelectedAccountBoundary>
  );
};
