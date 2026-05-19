import { ActivityIndicator, View } from 'react-native';

import { SafeScrollView } from '#src/components/safe-scroll-view';

export default function BooksScreen() {
  return (
    <SafeScrollView>
      <ActivityIndicator />
    </SafeScrollView>
  );
}
