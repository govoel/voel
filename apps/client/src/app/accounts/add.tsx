import { Host } from '@expo/ui';
import { Button, Form, Section, SecureField, TextField } from '@expo/ui/swift-ui';
import { headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';

import { Spacing } from '#src/constants/theme.ts';

export default function AddAccount() {
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          title: '',
        }}
      />

      <Host style={{ flex: 1 }}>
        <Form modifiers={[headerProminence('increased'), padding({ vertical: Spacing.three })]}>
          <Section title="Add an account">
            <TextField placeholder="Username" />
            <SecureField placeholder="Password" />
          </Section>

          <Section>
            <Button label="Login" />
          </Section>
        </Form>
      </Host>
    </>
  );
}
