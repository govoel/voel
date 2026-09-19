import { Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';

import { useCreateUserForm } from '#src/app/accounts/server/users/create/index.ts';
import { RoleField } from '#src/components/account-management/role-field';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';

export default function CreateUserScreen() {
  const form = useCreateUserForm({
    onSuccess: ({ userId }) => {
      router.replace(`/accounts/server/users/${userId}`);
    },
  });
  return (
    <>
      <Stack.Screen.Title>Create User</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <form.AppForm>
          <FormLayout
            title="Create user"
            footer={
              <form.SubmitButton
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>Create user</Text>
              </form.SubmitButton>
            }>
            <form.AppField name="name">
              {(field) => <field.TextField purpose="name" label="Name" />}
            </form.AppField>
            <form.AppField name="username">
              {(field) => <field.TextField purpose="username" label="Username" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField purpose="email" label="Email" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.SecureField purpose="newPassword" label="Password (8–128 characters)" />
              )}
            </form.AppField>
            <form.AppField name="role">{() => <RoleField />}</form.AppField>
          </FormLayout>
        </form.AppForm>
      </Host>
    </>
  );
}
