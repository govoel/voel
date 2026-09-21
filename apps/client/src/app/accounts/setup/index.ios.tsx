import { Host } from '@expo/ui';
import { Group } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { useSetupServerForm } from '#src/app/accounts/setup/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function SetupServerScreen() {
  const router = useRouter();
  const form = useSetupServerForm({
    onSuccess: async () => {
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen.Title>Setup New Server</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          <form.AppForm>
            <FormLayout
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
                    placeholder="https://demo.voel.app"
                  />
                )}
              </form.AppField>
              <form.AppField name="name">
                {(field) => <field.TextField purpose="name" label="Name" placeholder="Your Name" />}
              </form.AppField>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField purpose="email" label="Email" placeholder="you@example.com" />
                )}
              </form.AppField>
              <form.AppField name="username">
                {(field) => (
                  <field.TextField purpose="username" label="Username" placeholder="you" />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.SecureField
                    purpose="newPassword"
                    label="Password"
                    placeholder="ha!NiceTry"
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
