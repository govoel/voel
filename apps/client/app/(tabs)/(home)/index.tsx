import { Stack } from 'expo-router';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Text } from '~/components/ui/text';

import Player, { useAudioPlayerStatus } from '~/modules/voel-audio';

export default function HomeScreen() {
  const playerStatus = useAudioPlayerStatus();

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <FloatingPlayerDodgingLayout>
        <Text>Player Status:</Text>
        <Text>{JSON.stringify(playerStatus, null, 2)}</Text>
        <Text>Player Queue:</Text>
        <Text>{JSON.stringify(Player.getCurrentQueue(), null, 2)}</Text>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
