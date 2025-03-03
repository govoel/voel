import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';

export default function LibraryScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Library' }} />
      <View className="p-6">
        <Text>Library</Text>
      </View>
    </>
  );
}
