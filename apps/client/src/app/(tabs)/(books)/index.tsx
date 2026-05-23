import { Column } from '@expo/ui';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function BooksScreen() {
  return (
    <SafeScrollView>
      <Column spacing={12} alignment="start">
        <Text variant="h1">Books</Text>
      </Column>
    </SafeScrollView>
  );
}
