import { Host, List, Section } from '@expo/ui/swift-ui';
import { frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';
import { RoleField } from '#src/features/accounts/server-users/role-field';
import { createServerUserAtom } from '#src/features/accounts/server-users/user-atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';

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
    <Host style={{ flex: 1 }}>
      <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
        <form.AppForm>
          <Section title="Create user">
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="username">
              {(field) => <field.TextField label="Username" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" />}
            </form.AppField>
            <form.AppField name="password">
              {(field) => <field.SecureField label="Password (8–128 characters)" />}
            </form.AppField>
            <form.AppField name="role">{() => <RoleField />}</form.AppField>
            <form.SubmitButton>
              <Text>Create user</Text>
            </form.SubmitButton>
          </Section>
        </form.AppForm>
      </List>
    </Host>
  );
}
