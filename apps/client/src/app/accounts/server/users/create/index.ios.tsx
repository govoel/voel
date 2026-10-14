import { useAtomSuspense } from '@effect/atom-react';
import { Host } from '@expo/ui/swift-ui';
import { buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { Stack, useRouter } from 'expo-router';
import { useCreateUserForm } from '#src/app/accounts/server/users/create/index.ts';
import { FormLayout } from '#src/components/form/layout';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { RoleField } from '#src/domains/accounts/components/management/role-field';
import { activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';


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
  const accountKey = useAtomSuspense(activeAccountKeyAtom).value;
  const router = useRouter();

  return (
    <>
      <Stack.Screen.Title>Create User</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        {Option.match(accountKey, {
          onNone: () => (
            <FormLayout title="Create user" footer={null}>
              <ListState kind="empty" message="No active account." />
            </FormLayout>
          ),
          onSome: (key) => (
            <CreateUserForm
              key={JSON.stringify(key)}
              accountKey={key}
              onSuccess={({ userId }) => {
                router.replace({ pathname: '/accounts/server/users/[id]', params: { id: userId } });
              }}
            />
          ),
        })}
      </Host>
    </>
  );
}
