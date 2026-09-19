import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { router } from 'expo-router';
import { useRef } from 'react';

import { useCreateUserForm } from '#src/app/accounts/server/users/create/index.ts';
import { RoleField } from '#src/components/account-management/role-field';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function CreateUserScreen() {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const form = useCreateUserForm({
    onSuccess: async ({ userId }) => {
      await sheetRef.current?.hide();
      router.replace(`/accounts/server/users/${userId}`);
    },
  });
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <form.AppForm>
        <FormLayout
          title="Create user"
          footer={
            <form.SubmitButton platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
              <Text>Create user</Text>
            </form.SubmitButton>
          }>
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                purpose="name"
                label="Name"
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
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
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
                label="Password (8–128 characters)"
                platformProps={{
                  android: {
                    modifiers: [fillMaxWidth()],
                  },
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="role">{() => <RoleField />}</form.AppField>
        </FormLayout>
      </form.AppForm>
    </AndroidAccountsSheet>
  );
}
