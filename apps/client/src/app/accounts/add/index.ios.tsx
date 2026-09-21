import { Group, Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useAddAccountForm } from '#src/app/accounts/add/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function AddAccountScreen() {
  const router = useRouter();
  const { serverUrl, username, reauthenticate } = useLocalSearchParams<{
    serverUrl?: string;
    username?: string;
    reauthenticate?: string;
  }>();
  const form = useAddAccountForm({
    ...(serverUrl !== void 0 && username !== void 0
      ? { initialAccount: { serverUrl, username } }
      : {}),
    onSuccess: async () => {
      router.back();
    },
  });

  return (
    <>
      <Stack.Screen.Title>
        {reauthenticate === 'true' ? 'Sign In Again' : 'Add Account'}
      </Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <Group>
          <form.AppForm>
            <FormLayout
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
