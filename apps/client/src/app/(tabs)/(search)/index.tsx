import { Host } from '@expo/ui';
import { Stack } from 'expo-router';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function SearchScreen() {
  return (
    <>
      <Stack.Screen.Title>Search</Stack.Screen.Title>
      <Stack.SearchBar placement="integrated" placeholder="Search" onChangeText={() => void 0} />

      <SafeScrollView>
        <Host>
          <Text variant="h1">Explore</Text>
        </Host>
      </SafeScrollView>
    </>
  );
}
