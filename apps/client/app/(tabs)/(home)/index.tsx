import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { toast } from 'sonner-native';

import { Text } from '~/components/ui/text';

import Player, { useAudioPlayerStatus } from '~/modules/voel-audio';

export default function HomeScreen() {
  const playerStatus = useAudioPlayerStatus();

  useEffect(() => {
    if (playerStatus?.errorCode) {
      toast.error('Playback failed', { description: `Error code: ${playerStatus.errorCode}` });
    }
  }, [playerStatus?.errorCode]);

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <ScrollView className="px-6">
        <View className="py-6">
          <Text>{JSON.stringify(playerStatus, null, 2)}</Text>
          <Text>{JSON.stringify(Player.getCurrentQueue(), null, 2)}</Text>
        </View>
      </ScrollView>
    </>
  );
}
