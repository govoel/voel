import { Schema } from 'effect';

import { AuthChangePasswordInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { changePasswordAtom } from '#src/features/accounts/profile/atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';

class PasswordFormInput extends AuthChangePasswordInput.pipe(
  Schema.fieldsAssign({
    confirmPassword: Schema.String,
  })
).check(
  Schema.makeFilter(
    (value) => value.newPassword === value.confirmPassword || 'Passwords must match'
  )
) {}

export const PasswordForm = ({ onSuccess }: { onSuccess: () => void | Promise<void> }) => {
  const form = useAppForm({
    schema: PasswordFormInput,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mutation: changePasswordAtom,
    onFailure: authFailureMessage,
    onSuccess,
  });
  return (
    <form.AppForm>
      <FormLayout
        title="Change password"
        footer={
          <form.SubmitButton>
            <Text>Save password</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="currentPassword">
          {(field) => <field.SecureField label="Current password" />}
        </form.AppField>
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
