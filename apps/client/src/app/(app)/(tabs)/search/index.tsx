import { Stack } from 'expo-router';

import { TabScreenPage } from '#src/components/tab-screen-page';
import { Text } from '#src/components/text';

export default function SearchScreen() {
  return (
    <>
      <Stack.Screen.Title>Search</Stack.Screen.Title>
      <Stack.SearchBar placement="integrated" placeholder="Search" onChangeText={() => void 0} />

      <TabScreenPage>
        <Text variant="h1">Explore</Text>
      </TabScreenPage>
    </>
  );
}
