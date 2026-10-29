import { Effect, Schema } from 'effect';
import { Reactivity } from 'effect/reactivity';

import type { AuthUser } from '@repo/auth-api/shared.ts';
import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import type { AccountKey } from '#src/domains/accounts/schema.ts';
import { useSelectedAccount } from '#src/domains/accounts/scope.ts';

const createServerUser = Effect.fnUntraced(
  function* ({
    account,
    input,
  }: {
    readonly account: AccountKey;
    readonly input: typeof AuthCreateUserInput.Type;
  }) {
    const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
    return yield* client.admin.createUser({
      name: input.name,
      username: input.username,
      email: input.email,
      password: input.password,
      role: input.role,
    });
  },
  Reactivity.mutation(['auth.users'])
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
    onSubmit: ({ value }) => createServerUser({ account, input: value }),
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
