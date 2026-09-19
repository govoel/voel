import { Effect } from 'effect';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/app/accounts/auth-failure-message.ts';
import { useAppForm } from '#src/components/form';
import { activeAccountAuthClientAtom } from '#src/services/accounts/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';

const createServerUserAtom = AppRuntime.fn<typeof AuthCreateUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    return yield* client.admin.createUser(input);
  }),
  { reactivityKeys: ['auth.users'] }
);

export const useCreateUserForm = ({
  onSuccess,
}: {
  readonly onSuccess: (props: {
    readonly userId: typeof AuthUser.fields.id.Type;
  }) => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: AuthCreateUserInput,
    mutation: createServerUserAtom,
    defaultValues: { name: '', username: '', email: '', password: '', role: 'under18' },
    onFailure: authFailureMessage,
    onSuccess: async ({ result }) => {
      await onSuccess({ userId: result.user.id });
    },
  });
  return form;
};
