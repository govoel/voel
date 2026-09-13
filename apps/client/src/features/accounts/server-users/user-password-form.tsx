import { Schema } from 'effect';

import { AuthSetUserPasswordInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { setServerUserPasswordAtom } from '#src/features/accounts/server-users/user-atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';

class PasswordInput extends AuthSetUserPasswordInput.pipe(
  Schema.fieldsAssign({
    confirmPassword: Schema.String,
  })
).check(
  Schema.makeFilter(
    (value) => value.newPassword === value.confirmPassword || 'Passwords must match'
  )
) {}

export const PasswordForm = ({
  userId,
  onSuccess,
}: {
  userId: typeof AuthUser.fields.id.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: PasswordInput,
    mutation: setServerUserPasswordAtom,
    defaultValues: { userId, newPassword: '', confirmPassword: '' },
    onFailure: authFailureMessage,
    onSuccess,
  });
  return (
    <form.AppForm>
      <FormLayout
        title="Set a new password"
        footer={
          <form.SubmitButton>
            <Text>Set password</Text>
          </form.SubmitButton>
        }>
        <Text>
          This replaces the user’s password. Share the new password securely. Existing sessions
          remain signed in.
        </Text>
        <form.AppField name="newPassword">
          {(field) => <field.SecureField label="New password (8–128 characters)" />}
        </form.AppField>
        <form.AppField name="confirmPassword">
          {(field) => <field.SecureField label="Confirm new password" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};
