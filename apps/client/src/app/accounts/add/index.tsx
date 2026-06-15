import { Host } from '@expo/ui';
import { Group, List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
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

import { useAddAccountForm } from '#src/app/accounts/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function AddAccountScreen() {
  const form = useAddAccountForm({ onClose: router.back });

  return (
    <Host style={{ flex: 1 }}>
      <Group>
        <form.AppForm>
          <ZStack alignment="bottom">
            <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
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

            <VStack
              spacing={Spacing.two}
              modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
              <form.SubmitButton
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>Login</Text>
              </form.SubmitButton>
            </VStack>
          </ZStack>
        </form.AppForm>
      </Group>
    </Host>
  );
}
