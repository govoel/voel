import { Column, Host, Text } from '@expo/ui';
import { ScrollView } from 'react-native';

import { iosTextStyle } from '#modules/design-system/index.ts';
import { StatusBarBackground } from '#src/components/status-bar-background.tsx';

export default function HomeScreen() {
  return (
    <>
      <StatusBarBackground />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <Host matchContents>
          <Column>
            <Text modifiers={[iosTextStyle('largeTitle')]}>Large title</Text>
            <Text modifiers={[iosTextStyle('title')]}>Title</Text>
            <Text modifiers={[iosTextStyle('headline')]}>Headline</Text>
            <Text modifiers={[iosTextStyle('body')]}>Body</Text>
            <Text modifiers={[iosTextStyle('caption')]}>Caption</Text>
          </Column>
        </Host>
      </ScrollView>
    </>
  );
}
