import { Button, Host, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, frame, multilineTextAlignment, padding } from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import type { NoActiveAccountViewComponent } from '#src/components/no-active-account-view';
import { StatusBarGradient } from '#src/components/safe-scroll-view/status-bar-gradient.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccountView = (({ header }) => {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'light' ? '#ffffff' : '#000000';

  return (
    <>
      <StatusBarGradient backgroundColor={backgroundColor} />

      <Host style={{ flex: 1 }}>
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
      </Host>
    </>
  );
}) satisfies NoActiveAccountViewComponent;
