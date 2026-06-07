import { Button, HStack, Image, Spacer } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { PlatformColor } from 'react-native';

import type { TabScreenHeaderComponent } from '#src/components/tab-screen-header';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const TabScreenHeader = (({ title }) => {
  const router = useRouter();

  return (
    <HStack alignment="center" spacing={Spacing.two} modifiers={[frame({ maxWidth: Infinity })]}>
      <Text variant="h1">{title}</Text>

      <Spacer />

      <Button
        onPress={() => {
          router.navigate('/accounts');
        }}
        modifiers={[buttonStyle('plain')]}>
        <Image
          systemName="person.crop.circle.fill"
          size={32}
          color={PlatformColor('secondaryLabel')}
        />
      </Button>
    </HStack>
  );
}) satisfies TabScreenHeaderComponent;
