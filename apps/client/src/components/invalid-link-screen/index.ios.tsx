import { Button, Host, List, Section } from '@expo/ui/swift-ui';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import type { InvalidLinkScreenComponent } from '#src/components/invalid-link-screen';
import { goBackOrHome } from '#src/components/invalid-link-screen/index.tsx';
import { Text } from '#src/components/text';

export const InvalidLinkScreen = (() => {
  const router = useRouter();
  return (
    <>
      <Stack.Screen.Title>Invalid Link</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <List modifiers={[frame({ maxHeight: Infinity })]}>
          <Section>
            <Text>This link is invalid.</Text>
            <Button
              onPress={() => {
                goBackOrHome({ router });
              }}>
              <Text>Back</Text>
            </Button>
          </Section>
        </List>
      </Host>
    </>
  );
}) satisfies InvalidLinkScreenComponent;
