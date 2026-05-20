import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function MoviesScreen() {
  return (
    <SafeScrollView>
      <Text variant="h1">Movies</Text>
    </SafeScrollView>
  );
}
