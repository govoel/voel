import { Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';

import { useAddAccountForm } from '#src/app/accounts/add';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function AddAccountScreen() {
  const form = useAddAccountForm({ onClose: router.back });

  return (
    <AndroidAccountsSheet>
      <form.AppForm>
        <Column
          modifiers={[paddingAll(Spacing.three)]}
          verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h3">Add an account</Text>

          <form.AppField name="serverUrl">
            {(field) => (
              <field.TextField
                label="Server URL"
                placeholder="https://demo.voel.app"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                    keyboardOptions: {
                      keyboardType: 'uri',
                      capitalization: 'none',
                      autoCorrectEnabled: false,
                    },
                  },
                }}
              />
            )}
          </form.AppField>

          <form.AppField name="username">
            {(field) => (
              <field.TextField
                label="Username"
                placeholder="you"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                    keyboardOptions: {
                      keyboardType: 'ascii',
                      capitalization: 'none',
                      autoCorrectEnabled: false,
                    },
                  },
                }}
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => (
              <field.SecureField
                label="Password"
                placeholder="ha!NiceTry"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>

          <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
            <Text>Login</Text>
          </form.SubmitButton>
        </Column>
      </form.AppForm>
    </AndroidAccountsSheet>
  );
}
