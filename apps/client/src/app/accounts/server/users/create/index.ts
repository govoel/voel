import { Effect, Schema } from 'effect';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { useAppForm } from '#src/components/form';
import { activeAccountAuthClientAtom } from '#src/services/accounts/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';

const createServerUserAtom = AppRuntime.fn<typeof AuthCreateUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    return yield* client.admin.createUser({
      name: input.name,
      username: input.username,
      email: input.email,
      password: input.password,
      role: input.role,
    });
  }),
  { reactivityKeys: ['auth.users'] }
);

class CreateUserInput extends AuthCreateUserInput.pipe(
  Schema.fieldsAssign({
    confirmPassword: Schema.String,
  })
).check(
  Schema.makeFilter(
    ({ password, confirmPassword }) =>
      password === confirmPassword || {
        path: ['confirmPassword'],
        issue: 'Passwords must match',
      }
  )
) {}

export const useCreateUserForm = ({
  onSuccess,
}: {
  readonly onSuccess: (props: {
    readonly userId: typeof AuthUser.fields.id.Type;
  }) => void | Promise<void>;
}) =>
  useAppForm({
    schema: CreateUserInput,
    mutation: createServerUserAtom,
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'under18',
    },
    onFailure: authFailureMessage,
    onSuccess: async ({ result }) => {
      await onSuccess({ userId: result.user.id });
    },
  });
