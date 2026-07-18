import { Button, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, frame, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';

import type { NoActiveAccountViewComponent } from '#src/components/no-active-account-view';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccountView = (() => (
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
)) satisfies NoActiveAccountViewComponent;
