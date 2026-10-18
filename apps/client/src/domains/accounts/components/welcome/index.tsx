import { Button, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const Welcome = () => {
  const router = useRouter();

  return (
    <SafeScrollView>
      <VStack
        alignment="leading"
        spacing={Spacing.four}
        modifiers={[padding({ all: Spacing.four }), frame({ maxWidth: Infinity })]}>
        <Text variant="h1">Welcome to Voel</Text>
        <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
          Connect to your server to get started. Add an existing account or set up a new server.
        </Text>
        <VStack spacing={Spacing.two} modifiers={[frame({ maxWidth: Infinity })]}>
          <Button
            modifiers={[buttonStyle('borderedProminent')]}
            onPress={() => {
              router.push('/sign-in');
            }}>
            <Text>Add account</Text>
          </Button>
          <Button
            modifiers={[buttonStyle('bordered')]}
            onPress={() => {
              router.push('/server-setup');
            }}>
            <Text>Set up new server</Text>
          </Button>
        </VStack>
      </VStack>
    </SafeScrollView>
  );
};
