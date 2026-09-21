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
      router.replace({ pathname: '/accounts/server/users/[id]', params: { id: userId } });
    },
  });
  return (
    <>
      <Stack.Screen.Title />
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
