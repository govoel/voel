import { Stack } from 'expo-router';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function CreateLibraryScreen() {
  return (
    <>
      <Stack.Screen.Title>New Library</Stack.Screen.Title>
      <SafeScrollView>
        <Text>Library creation is not available yet.</Text>
      </SafeScrollView>
    </>
  );
}
