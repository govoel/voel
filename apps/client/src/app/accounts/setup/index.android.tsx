import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';
import { useRef } from 'react';

import { useSetupServerForm } from '#src/app/accounts/setup/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function SetupServerScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const form = useSetupServerForm({
    onSuccess: async () => {
      await sheetRef.current?.hide();
      router.dismissTo('/accounts');
    },
  });

  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title="Setup new server"
          footer={
            <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
              <Text>Create account</Text>
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

          <form.AppField name="name">
            {(field) => (
              <field.TextField
                purpose="name"
                label="Name"
                placeholder="Your Name"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>

          <form.AppField name="email">
            {(field) => (
              <field.TextField
                purpose="email"
                label="Email"
                placeholder="you@example.com"
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
                purpose="newPassword"
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
