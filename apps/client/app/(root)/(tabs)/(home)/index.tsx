import { Stack } from 'expo-router';
import { View } from 'react-native';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Text } from '~/components/ui/text';

export default function HomeScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <FloatingPlayerDodgingLayout>
        <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
          <Text className="text-center">Coming soon</Text>
        </View>
      </FloatingPlayerDodgingLayout>
    </>
  );
}
