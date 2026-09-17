import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';
import { useRef } from 'react';

import { useAddAccountForm } from '#src/app/accounts/add/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function AddAccountScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const form = useAddAccountForm({
    onSuccess: async () => {
      await sheetRef.current?.hide();
      router.dismissTo('/accounts');
    },
  });

  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title="Add an account"
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
