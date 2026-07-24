import { useAtomSuspense } from '@effect/atom-react';
import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxSize, fillMaxWidth, padding, weight } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { ScreenHost } from '#src/components/screen-host';
import type { TabScreenPageComponent } from '#src/components/tab-screen-page';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';
import { activeAccountAtom } from '#src/services/accounts/atoms.ts';

export const TabScreenPage = (({
  header,
  children,
}: {
  readonly header?: ReactNode;
  readonly children?: ReactNode;
}) => {
  const activeAccount = useAtomSuspense(activeAccountAtom);

  return Option.match(activeAccount.value, {
    onNone: () => (
      <ScreenHost>
        {(contentTopInset) => (
          <Column
            modifiers={[
              fillMaxSize(),
              padding(Spacing.three, contentTopInset + Spacing.three, Spacing.three, Spacing.three),
            ]}
            horizontalAlignment="start">
            {header}
            <Column
              modifiers={[weight(1), fillMaxWidth()]}
              horizontalAlignment="center"
              verticalArrangement="center">
              <Column
                horizontalAlignment="center"
                verticalArrangement={{ spacedBy: Spacing.three }}>
                <Column
                  horizontalAlignment="center"
                  verticalArrangement={{ spacedBy: Spacing.one }}>
                  <Text variant="h4">No active account</Text>
                  <Text>Select or add an account to continue.</Text>
                </Column>
                <Button
                  onClick={() => {
                    router.push('/accounts');
                  }}>
                  <Text>Manage accounts</Text>
                </Button>
              </Column>
            </Column>
          </Column>
        )}
      </ScreenHost>
    ),
    onSome: () => (
      <SafeScrollView>
        <Column
          horizontalAlignment="start"
          verticalArrangement={{ spacedBy: Spacing.two }}
          modifiers={[padding(Spacing.three, 0, Spacing.three, 0)]}>
          {header}
          {children}
        </Column>
      </SafeScrollView>
    ),
  });
}) satisfies TabScreenPageComponent;
