import { Column } from '@expo/ui';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function HomeScreen() {
  return (
    <SafeScrollView>
      <Column>
        <Text variant="h1">Home</Text>
      </Column>
    </SafeScrollView>
  );
}
