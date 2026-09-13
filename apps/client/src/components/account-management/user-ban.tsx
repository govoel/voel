import { AuthBanUserInput } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { MutationAction } from '#src/components/account-management/mutation-action.tsx';
import { EditorSheet, FormLayout, Panel } from '#src/components/account-management/ui';
import {
  banServerUserAtom,
  unbanServerUserAtom,
} from '#src/components/account-management/user-atoms.ts';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';

const BanForm = ({
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

export const UserBan = ({ user }: { user: typeof AuthAdminUserDetails.Type }) => {
  if (user.banned === true) {
    return (
      <Panel title="Ban status">
        <MutationAction
          mutation={unbanServerUserAtom}
          input={{ userId: user.id }}
          title="Unban user"
          message={`Allow @${user.username} to sign in again? Revoked sessions will not be restored.`}
        />
      </Panel>
    );
  }
  return (
    <Panel title="Ban status">
      <EditorSheet title="Ban user" contentProps={{ user }}>
        {BanForm}
      </EditorSheet>
    </Panel>
  );
};
