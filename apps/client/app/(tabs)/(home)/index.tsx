import { Stack } from 'expo-router';
import { View } from 'react-native';

import { Text } from '~/components/ui/text';

export default function HomeScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <View className="p-6">
        <Text>Home</Text>
      </View>
    </>
  );
}
