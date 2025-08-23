import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="p-6">
        <Large>This screen doesn&rsquo;t exist.</Large>

        <Button
          className="mt-4"
          onPress={() => {
            router.dismissAll();
          }}>
          <Text>Head back</Text>
        </Button>
      </View>
    </>
  );
}
