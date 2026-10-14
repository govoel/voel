import { Host } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { materialSeedColor } from '#src/constants/material.ts';
import { useSetupServerForm } from '#src/domains/accounts/features/setup/model.ts';


export const SetupServerScreen = ({ mode }: { readonly mode: 'onboarding' | 'management' }) => {
  const router = useRouter();
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const form = useSetupServerForm({
    onSuccess: async () => {
      if (mode === 'onboarding') {
        return;
      }
      await sheetRef.current?.hide();
      router.dismissTo('/accounts');
    },
  });

  const content = (
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
  );
  return mode === 'onboarding' ? (
    <Host seedColor={materialSeedColor} style={{ flex: 1 }}>
      {content}
    </Host>
  ) : (
    <AndroidAccountsSheet ref={sheetRef}>{content}</AndroidAccountsSheet>
  );
};
