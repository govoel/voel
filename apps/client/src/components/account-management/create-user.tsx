import { router } from 'expo-router';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { RoleField } from '#src/components/account-management/role-field.tsx';
import { Page, Panel } from '#src/components/account-management/ui';
import { createServerUserAtom } from '#src/components/account-management/user-atoms.ts';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';

export default function CreateUserScreen() {
  const form = useAppForm({
    schema: AuthCreateUserInput,
    mutation: createServerUserAtom,
    defaultValues: { name: '', username: '', email: '', password: '', role: 'under18' },
    onFailure: authFailureMessage,
    onSuccess: ({ result }) => {
      router.replace(`/accounts/server/users/${result.user.id}`);
    },
  });
  return (
    <Page>
      <form.AppForm>
        <Panel title="Create user">
          <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
          <form.AppField name="username">
            {(field) => <field.TextField label="Username" />}
          </form.AppField>
          <form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>
          <form.AppField name="password">
            {(field) => <field.SecureField label="Password (8–128 characters)" />}
          </form.AppField>
          <form.AppField name="role">{() => <RoleField />}</form.AppField>
          <form.SubmitButton>
            <Text>Create user</Text>
          </form.SubmitButton>
        </Panel>
      </form.AppForm>
    </Page>
  );
}
