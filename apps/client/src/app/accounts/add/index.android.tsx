import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';

import { useAddAccountForm } from '#src/app/accounts/add/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function AddAccountScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
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
      await sheetRef.current?.hide();
      router.dismissTo('/accounts');
    },
  });

  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title={reauthenticate === 'true' ? 'Sign in again' : 'Add an account'}
          footer={
            <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
              <Text>Login</Text>
            </form.SubmitButton>
          }>
          <form.AppField name="serverUrl">
            {(field) => (
              <field.TextField
                purpose="url"
                label="Server URL"
                placeholder="https://demo.voel.app"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
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
                placeholder="you"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => (
              <field.SecureField
                purpose="currentPassword"
                label="Password"
                placeholder="ha!NiceTry"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>
        </FormLayout>
      </form.AppForm>
    </AndroidAccountsSheet>
  );
}
