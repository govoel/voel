import { Stack } from 'expo-router';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function EditLibraryScreen() {
  return (
    <>
      <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
      <SafeScrollView>
        <Text>Library editing is not available yet.</Text>
      </SafeScrollView>
    </>
  );
}
