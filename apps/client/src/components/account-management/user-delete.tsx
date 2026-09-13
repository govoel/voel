import { router } from 'expo-router';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { MutationAction } from '#src/components/account-management/mutation-action.tsx';
import { Panel } from '#src/components/account-management/ui';
import { deleteServerUserAtom } from '#src/components/account-management/user-atoms.ts';

export const UserDelete = ({ user }: { user: typeof AuthUser.Type }) => (
  <Panel title="Delete user">
    <MutationAction
      mutation={deleteServerUserAtom}
      input={{ userId: user.id }}
      title="Delete server user"
      message={`Permanently delete @${user.username} (${user.email}) from this server? Their credentials and sessions will be removed. This cannot be undone.`}
      onSuccess={() => {
        router.replace('/accounts/server/users');
      }}
    />
  </Panel>
);
