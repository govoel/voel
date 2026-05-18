import { Host, Text } from '@expo/ui';
import { Stack } from 'expo-router';

export default function SearchScreen() {
  return (
    <>
      <Stack.Screen.Title>Search</Stack.Screen.Title>
      <Stack.SearchBar placement="integrated" placeholder="Search" onChangeText={() => void 0} />

      <Host matchContents>
        <Text>Search</Text>
      </Host>
    </>
  );
}
