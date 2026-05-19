import { Host, Text } from '@expo/ui';
import { ScrollView } from 'react-native';

export default function BooksScreen() {
  return (
    <ScrollView>
      <Host matchContents>
        <Text style={{ backgroundColor: 'red' }}>
          BooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooksBooks
        </Text>
      </Host>
    </ScrollView>
  );
}
