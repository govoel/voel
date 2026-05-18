import { Host, Text } from '@expo/ui';
import { Stack } from 'expo-router';

export default function BooksScreen() {
  return (
    <>
      <Stack.Title style={{ textAlign: 'left' }}>Books</Stack.Title>
      <Host matchContents>
        <Text>Books</Text>
      </Host>
    </>
  );
}
