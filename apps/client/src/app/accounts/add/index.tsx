import { Host } from '@expo/ui';
import { Button, Group, List, Section, Spacer, VStack } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  buttonStyle,
  frame,
  headerProminence,
  keyboardType,
  padding,
  textContentType,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { PlatformColor } from 'react-native';

import { useAddAccountForm } from '#src/app/accounts/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function AddAccountScreen() {
  const form = useAddAccountForm({ onClose: router.back });

  return (
    <Host style={{ flex: 1, backgroundColor: PlatformColor('systemGroupedBackground') }}>
      <Group>
        <form.AppForm>
          <VStack modifiers={[padding({ vertical: Spacing.three })]}>
            <List modifiers={[headerProminence('increased')]}>
              <Section title="Add an account">
                <form.AppField name="serverUrl">
                  {(field) => (
                    <field.TextField
                      label="Server URL"
                      platformProps={{
                        ios: {
                          placeholder: 'https://demo.voel.app',
                          modifiers: [
                            keyboardType('url'),
                            textContentType('URL'),
                            textInputAutocapitalization('never'),
                            autocorrectionDisabled(),
                          ],
                        },
                      }}
                    />
                  )}
                </form.AppField>
                <form.AppField name="username">
                  {(field) => (
                    <field.TextField
                      label="Username"
                      platformProps={{
                        ios: {
                          placeholder: 'you',
                          modifiers: [
                            keyboardType('ascii-capable'),
                            textContentType('username'),
                            textInputAutocapitalization('never'),
                            autocorrectionDisabled(),
                          ],
                        },
                      }}
                    />
                  )}
                </form.AppField>
                <form.AppField name="password">
                  {(field) => (
                    <field.SecureField
                      label="Password"
                      platformProps={{ ios: { placeholder: 'ha!NiceTry' } }}
                    />
                  )}
                </form.AppField>
              </Section>
            </List>

            <Spacer />

            <VStack spacing={Spacing.two} modifiers={[padding({ horizontal: Spacing.three })]}>
              <form.SubmitButton
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>Login</Text>
              </form.SubmitButton>

              <Button
                role="destructive"
                modifiers={[buttonStyle('bordered')]}
                onPress={() => {
                  form.reset();
                  router.back();
                }}>
                <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
              </Button>
            </VStack>
          </VStack>
        </form.AppForm>
      </Group>
    </Host>
  );
}
