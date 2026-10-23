import { Effect, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';
import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const createServerUserAtom = Atom.family((account: ActiveAccountKey) =>
  AppRuntime.fn<typeof AuthCreateUserInput.Type>()(
    Effect.fnUntraced(function* (input) {
      const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
      return yield* client.admin.createUser({
        name: input.name,
        username: input.username,
        email: input.email,
        password: input.password,
        role: input.role,
      });
    }),
    { reactivityKeys: ['auth.users'] }
  )
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
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: CreateUserInput,
    mutation: createServerUserAtom(account),
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'under18',
    },
    onFailure: authFailureMessage,
    onSuccess: async ({ result }) => onSuccess({ userId: result.user.id }),
  });
};
