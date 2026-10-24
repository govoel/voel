import { Button, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, frame, multilineTextAlignment, padding } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';

import { ScreenHost } from '#src/components/screen-host';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const NoActiveAccount = () => {
  const router = useRouter();

  return (
    <ScreenHost>
      {() => (
        <VStack
          alignment="center"
          spacing={Spacing.three}
          modifiers={[
            frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
            padding({ all: Spacing.three }),
          ]}>
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
      )}
    </ScreenHost>
  );
};
