import { LazyRow } from '@expo/ui/jetpack-compose';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function BooksScreen() {
  return (
    <SafeScrollView>
      <Text variant="h1">Books</Text>

      <LazyRow>
        {Array.from({ length: 20 }).map((_, i) => (
          <Text key={i}>Item {i}</Text>
        ))}
      </LazyRow>
    </SafeScrollView>
  );
}
