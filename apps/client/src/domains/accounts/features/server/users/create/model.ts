import { Effect, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { accountAuthClientAtom } from '#src/domains/accounts/atoms.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import type { AccountStorageKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const createServerUserAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.fn<typeof AuthCreateUserInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
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
  accountKey,
  onSuccess,
}: {
  readonly accountKey: AccountStorageKey;
  readonly onSuccess: (props: {
    readonly userId: typeof AuthUser.fields.id.Type;
  }) => void | Promise<void>;
}) =>
  useAppForm({
    schema: CreateUserInput,
    mutation: createServerUserAtom(accountKey),
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
