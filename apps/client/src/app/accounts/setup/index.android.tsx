import { Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';

import { useSetupServerForm } from '#src/app/accounts/setup/index.tsx';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export default function SetupServerScreen() {
  const form = useSetupServerForm({ onClose: router.back });

  return (
    <AndroidAccountsSheet>
      <form.AppForm>
        <Column
          modifiers={[padding(Spacing.three, 0, Spacing.three, Spacing.three)]}
          verticalArrangement={{ spacedBy: Spacing.two }}>
          <Text variant="h3">Setup new server</Text>

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

          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label="Name"
                placeholder="Your Name"
                platformProps={{ android: { modifiers: [fillMaxWidth()] } }}
              />
            )}
          </form.AppField>

          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="Email"
                placeholder="you@example.com"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                    keyboardOptions: {
                      keyboardType: 'email',
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
            <Text>Create account</Text>
          </form.SubmitButton>
        </Column>
      </form.AppForm>
    </AndroidAccountsSheet>
  );
}
