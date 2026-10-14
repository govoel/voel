import { Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';
import { RoleField } from '#src/domains/accounts/components/management/role-field';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { useSelectedAccount } from '#src/domains/accounts/features/selection.ts';
import { useCreateUserForm } from '#src/domains/accounts/features/server/users/create/model.ts';


const CreateUserForm = (props: Parameters<typeof useCreateUserForm>[0]) => {
  const form = useCreateUserForm(props);
  return (
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
          {(field) => <field.TextField purpose="name" label="Name" placeholder="Someone Else" />}
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
  );
};

export default function CreateUserScreen() {
  const accountKey = useSelectedAccount();
  const router = useRouter();

  return (
    <>
      <Stack.Screen.Title>Create User</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <CreateUserForm
          key={JSON.stringify(accountKey)}
          accountKey={accountKey}
          onSuccess={({ userId }) => {
            router.replace({ pathname: '/accounts/server/users/[id]', params: { id: userId } });
          }}
        />
      </Host>
    </>
  );
}
