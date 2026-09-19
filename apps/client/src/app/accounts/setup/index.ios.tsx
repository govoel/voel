import { Host } from '@expo/ui';
import { Group } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';

import { useSetupServerForm } from '#src/app/accounts/setup/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function SetupServerScreen() {
  const form = useSetupServerForm({
    onSuccess: async () => {
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen.Title />
      <Host style={{ flex: 1 }}>
        <Group>
          <form.AppForm>
            <FormLayout
              title="Setup New Server"
              footer={
                <form.SubmitButton
                  platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                  containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                  <Text>Create account</Text>
                </form.SubmitButton>
              }>
              <form.AppField name="serverUrl">
                {(field) => (
                  <field.TextField
                    purpose="url"
                    label="Server URL"
                    platformProps={{
                      ios: {
                        placeholder: 'https://demo.voel.app',
                      },
                    }}
                  />
                )}
              </form.AppField>
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    purpose="name"
                    label="Name"
                    platformProps={{
                      ios: { placeholder: 'Your Name' },
                    }}
                  />
                )}
              </form.AppField>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    purpose="email"
                    label="Email"
                    platformProps={{
                      ios: {
                        placeholder: 'you@example.com',
                      },
                    }}
                  />
                )}
              </form.AppField>
              <form.AppField name="username">
                {(field) => (
                  <field.TextField
                    purpose="username"
                    label="Username"
                    platformProps={{
                      ios: {
                        placeholder: 'you',
                      },
                    }}
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.SecureField
                    purpose="newPassword"
                    label="Password"
                    platformProps={{ ios: { placeholder: 'ha!NiceTry' } }}
                  />
                )}
              </form.AppField>
            </FormLayout>
          </form.AppForm>
        </Group>
      </Host>
    </>
  );
}
