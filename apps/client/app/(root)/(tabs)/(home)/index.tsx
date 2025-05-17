import { Stack } from 'expo-router';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { usePlaybackHistoryContext } from '~/components/playback-history-provider';
import { Text } from '~/components/ui/text';

import { useAudioPlayerStatus } from '~/modules/voel-audio';

export default function HomeScreen() {
  const playerStatus = useAudioPlayerStatus();
  const playbackHistory = usePlaybackHistoryContext();

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <FloatingPlayerDodgingLayout>
        <Text>Player Status:</Text>
        <Text>{JSON.stringify(playerStatus, null, 2)}</Text>
        <Text>Playback History:</Text>
        <Text>{JSON.stringify(playbackHistory, null, 2)}</Text>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
