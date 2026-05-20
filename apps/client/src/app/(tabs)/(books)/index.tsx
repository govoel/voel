import { Column, Row } from '@expo/ui';
import { ScrollView } from '@expo/ui/swift-ui';

import { SafeScrollView } from '#src/components/safe-scroll-view';
import { Text } from '#src/components/text';

export default function BooksScreen() {
  return (
    <SafeScrollView>
      <Column spacing={12} alignment="start">
        <Text variant="h1">Books</Text>

        <ScrollView axes="horizontal">
          <Row spacing={12}>
            {Array.from({ length: 20 }).map((_, i) => (
              <Text key={i}>Item {i}</Text>
            ))}
          </Row>
        </ScrollView>
      </Column>
    </SafeScrollView>
  );
}
