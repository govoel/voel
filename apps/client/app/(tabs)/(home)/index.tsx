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
        <Text>Player Status:</Text>
        <Text>{JSON.stringify(playerStatus, null, 4)}</Text>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
