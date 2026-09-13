import { AuthSetRoleInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { RoleField } from '#src/components/account-management/role-field.tsx';
import { EditorSheet, FormLayout, Panel } from '#src/components/account-management/ui';
import { setServerUserRoleAtom } from '#src/components/account-management/user-atoms.ts';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';

const RoleForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: AuthSetRoleInput,
    mutation: setServerUserRoleAtom,
    defaultValues: { userId: user.id, role: user.role },
    onFailure: authFailureMessage,
    onSuccess,
  });
  return (
    <form.AppForm>
      <FormLayout
        title="Change role"
        footer={
          <form.SubmitButton>
            <Text>Save role</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="role">{() => <RoleField />}</form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

export const UserRole = ({ user }: { user: typeof AuthUser.Type }) => (
  <Panel title="Role">
    <EditorSheet title="Change role" contentProps={{ user }}>
      {RoleForm}
    </EditorSheet>
  </Panel>
);
