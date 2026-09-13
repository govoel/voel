import { Schema } from 'effect';

import { AuthSetUserPasswordInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { EditorSheet, FormLayout, Panel } from '#src/components/account-management/ui';
import { setServerUserPasswordAtom } from '#src/components/account-management/user-atoms.ts';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';

class PasswordInput extends AuthSetUserPasswordInput.pipe(
  Schema.fieldsAssign({
    confirmPassword: Schema.String,
  })
).check(
  Schema.makeFilter(
    (value) => value.newPassword === value.confirmPassword || 'Passwords must match'
  )
) {}

const PasswordForm = ({
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

export const UserPassword = ({ user }: { user: typeof AuthUser.Type }) => (
  <Panel title="Set / reset password">
    <EditorSheet title="Set a new password" contentProps={{ userId: user.id }}>
      {PasswordForm}
    </EditorSheet>
  </Panel>
);
