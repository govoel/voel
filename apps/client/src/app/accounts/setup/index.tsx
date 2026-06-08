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

import { useSetupServerForm } from '#src/app/accounts/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function SetupServerScreen() {
  const form = useSetupServerForm({ onClose: router.back });

  return (
    <Host style={{ flex: 1 }}>
      <Group>
        <form.AppForm>
          <VStack modifiers={[padding({ vertical: Spacing.three })]}>
            <List modifiers={[headerProminence('increased')]}>
              <Section title="Setup new server">
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
                <form.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label="Name"
                      platformProps={{
                        ios: { placeholder: 'Your Name', modifiers: [textContentType('name')] },
                      }}
                    />
                  )}
                </form.AppField>
                <form.AppField name="email">
                  {(field) => (
                    <field.TextField
                      label="Email"
                      platformProps={{
                        ios: {
                          placeholder: 'you@example.com',
                          modifiers: [
                            keyboardType('email-address'),
                            textContentType('emailAddress'),
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
                <Text>Create account</Text>
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
