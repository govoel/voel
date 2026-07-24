import { useAtomSuspense } from '@effect/atom-react';
import { Button, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, frame, multilineTextAlignment, padding } from '@expo/ui/swift-ui/modifiers';
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
        {() => (
          <VStack
            alignment="leading"
            spacing={Spacing.three}
            modifiers={[
              frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
              padding({ horizontal: Spacing.three, vertical: Spacing.three }),
            ]}>
            {header}
            <VStack
              alignment="center"
              spacing={Spacing.three}
              modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' })]}>
              <VStack alignment="center" spacing={Spacing.one}>
                <Text variant="h4">No active account</Text>
                <Text modifiers={[multilineTextAlignment('center')]}>
                  Select or add an account to continue.
                </Text>
              </VStack>
              <Button
                label="Manage accounts"
                modifiers={[buttonStyle('borderedProminent')]}
                onPress={() => {
                  router.push('/accounts');
                }}
              />
            </VStack>
          </VStack>
        )}
      </ScreenHost>
    ),
    onSome: () => (
      <SafeScrollView>
        <VStack
          alignment="leading"
          spacing={Spacing.two}
          modifiers={[padding({ horizontal: Spacing.three })]}>
          {header}
          {children}
        </VStack>
      </SafeScrollView>
    ),
  });
}) satisfies TabScreenPageComponent;
