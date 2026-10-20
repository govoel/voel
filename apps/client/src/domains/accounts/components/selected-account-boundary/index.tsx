import { useAtomSuspense } from '@effect/atom-react';
import { Option } from 'effect';
import type { Stack } from 'expo-router';
import { Redirect } from 'expo-router';
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';

import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import { SelectedAccount } from '#src/domains/accounts/scope.ts';

// Only descendants remount; root and management navigation stay mounted.
export const SelectedAccountBoundary = ({
  children,
  fallback,
}: PropsWithChildren<{ readonly fallback: ReactNode }>): ReactNode => {
  const selected = useAtomSuspense(activeAccountKeyAtom).value;
  return Option.match(selected, {
    onNone: (): ReactNode => fallback,
    onSome: (key) => (
      <SelectedAccount.Provider
        key={JSON.stringify([key.serverUrl, key.userId, key.authStorageId])}
        value={key}>
        {children}
      </SelectedAccount.Provider>
    ),
  });
};

export const AccountManagementBoundary = ({ children }: PropsWithChildren) => (
  <SelectedAccountBoundary fallback={<Redirect href="/accounts" />}>
    {children}
  </SelectedAccountBoundary>
);

// Groups without a layout are hoisted into the management Stack. Scope only
// their screen content so native headers/back history and the modal stay mounted.
export const accountManagementScreenLayout = (({ route, children }) =>
  route.name.startsWith('(selected)/') ? (
    <AccountManagementBoundary>{children}</AccountManagementBoundary>
  ) : (
    children
  )) satisfies NonNullable<ComponentProps<typeof Stack>['screenLayout']>;
