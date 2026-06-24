import { Host } from '@expo/ui/swift-ui';
import { useLocalSearchParams } from 'expo-router';

import { Text } from '#src/components/text/index.tsx';

export default function ServerUserScreen() {
  const { id } = useLocalSearchParams();

  return (
    <Host>
      <Text>User {id}</Text>
    </Host>
  );
}
