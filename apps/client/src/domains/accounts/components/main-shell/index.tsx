import { useAtomSuspense } from '@effect/atom-react';
import type { PropsWithChildren, ReactNode } from 'react';

import { accountsAtom } from '#src/domains/accounts/atoms.ts';
import { NoActiveAccount } from '#src/domains/accounts/components/no-active-account';
import { SelectedAccountBoundary } from '#src/domains/accounts/components/selected-account-boundary';
import { Welcome } from '#src/domains/accounts/components/welcome';

export const MainShell = ({ children }: PropsWithChildren): ReactNode => {
  const accounts = useAtomSuspense(accountsAtom);
  return accounts.value.length === 0 ? (
    <Welcome />
  ) : (
    <SelectedAccountBoundary fallback={<NoActiveAccount />}>{children}</SelectedAccountBoundary>
  );
};
