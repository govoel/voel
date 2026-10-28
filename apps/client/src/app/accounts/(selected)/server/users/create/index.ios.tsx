import { Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useCreateUserForm } from '#src/app/accounts/(selected)/server/users/create/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { RoleField } from '#src/domains/accounts/components/management/role-field';

export default function CreateUserScreen() {
  const [createdUserId, setCreatedUserId] = useState<typeof AuthUser.fields.id.Type | null>(null);
  const form = useCreateUserForm({
    onSuccess: ({ userId }) => {
      setCreatedUserId(userId);
    },
  });
  if (createdUserId !== null) {
    return (
      <Redirect href={{ pathname: '/accounts/server/users/[id]', params: { id: createdUserId } }} />
    );
  }
  return (
    <>
      <Stack.Screen.Title>Create User</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <form.AppForm>
          <FormLayout
            footer={
              <form.SubmitButton
                platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
                containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
                <Text>Create user</Text>
              </form.SubmitButton>
            }>
            <form.AppField name="name">
              {(field) => (
                <field.TextField purpose="name" label="Name" placeholder="Someone Else" />
              )}
            </form.AppField>
            <form.AppField name="username">
              {(field) => (
                <field.TextField purpose="username" label="Username" placeholder="someoneElse" />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField purpose="email" label="Email" placeholder="someone@else.com" />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.SecureField
                  purpose="newPassword"
                  label="Password"
                  placeholder="iKnowYourPassword!"
                />
              )}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.SecureField
                  purpose="newPassword"
                  label="Confirm password"
                  placeholder="iKnowYourPassword!"
                />
              )}
            </form.AppField>
            <form.AppField name="role">{() => <RoleField />}</form.AppField>
          </FormLayout>
        </form.AppForm>
      </Host>
    </>
  );
}
