import { Link, Stack } from 'expo-router';
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

        <Link href="/" push asChild>
          <Button className="mt-4">
            <Text>Go home</Text>
          </Button>
        </Link>
      </View>
    </>
  );
}
