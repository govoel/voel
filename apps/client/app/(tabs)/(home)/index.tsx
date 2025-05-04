import { Stack } from 'expo-router';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Text } from '~/components/ui/text';

import { useAudioPlayerStatus } from '~/modules/voel-audio';

export default function HomeScreen() {
  const playerStatus = useAudioPlayerStatus();

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <FloatingPlayerDodgingLayout>
        <Text>{JSON.stringify(playerStatus, null, 2)}</Text>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
