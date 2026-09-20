import { Group, Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';

import { useAddAccountForm } from '#src/app/accounts/add/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function AddAccountScreen() {
  const form = useAddAccountForm({
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
              title="Add Account"
              footer={
                <form.SubmitButton
                  platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                  containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                  <Text>Login</Text>
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
              <form.AppField name="username">
                {(field) => (
                  <field.TextField purpose="username" label="Username" placeholder="you" />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.SecureField
                    purpose="currentPassword"
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
