import { AuthSetRoleInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { RoleField } from '#src/features/accounts/server-users/role-field';
import { setServerUserRoleAtom } from '#src/features/accounts/server-users/user-atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';

export const RoleForm = ({
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
