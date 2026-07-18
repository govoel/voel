import { useAtomSuspense } from '@effect/atom-react';
import { Option } from 'effect';
import type { ReactNode } from 'react';

import { NoActiveAccountView } from '#src/components/no-active-account-view';
import { SafeScrollView } from '#src/components/safe-scroll-view';
import { TabScreenColumn } from '#src/components/tab-screen-column';
import { activeAccountAtom } from '#src/services/accounts/atoms.ts';

export const TabScreenPage = ({
  header,
  children,
}: {
  readonly header?: ReactNode;
  readonly children?: ReactNode;
}) => {
  const activeAccount = useAtomSuspense(activeAccountAtom);

  return Option.match(activeAccount.value, {
    onNone: () => <NoActiveAccountView header={header} />,
    onSome: () => (
      <SafeScrollView>
        <TabScreenColumn>
          {header}
          {children}
        </TabScreenColumn>
      </SafeScrollView>
    ),
  });
};
