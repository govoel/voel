import { AuthBanUserInput } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { FormLayout } from '#src/components/form/layout';
import { Text } from '#src/components/text';
import { banServerUserAtom } from '#src/features/accounts/server-users/user-atoms.ts';
import { authFailureMessage } from '#src/features/accounts/shared/auth-errors.ts';

export const BanForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthAdminUserDetails.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: AuthBanUserInput,
    mutation: banServerUserAtom,
    defaultValues: { userId: user.id, banReason: '' },
    onFailure: authFailureMessage,
    onSuccess,
  });
  return (
    <form.AppForm>
      <FormLayout
        title="Ban user"
        footer={
          <form.SubmitButton>
            <Text>Confirm ban</Text>
          </form.SubmitButton>
        }>
        <Text>
          Ban @{user.username} indefinitely? This signs out all their devices and prevents sign-in
          until you unban them.
        </Text>
        <form.AppField name="banReason">
          {(field) => <field.TextField label="Ban reason" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};
