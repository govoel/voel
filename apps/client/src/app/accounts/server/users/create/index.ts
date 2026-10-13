import { useAtomSuspense } from '@effect/atom-react';
import { Effect, Schema } from 'effect';
import type { Option } from 'effect';
import { Atom } from 'effect/reactivity';

import { AuthCreateUserInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { accountAuthClientAtom, activeAccountKeyAtom } from '#src/domains/accounts/atoms.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';

const createServerUserAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
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
  onSuccess,
}: {
  readonly onSuccess: (props: {
    readonly userId: typeof AuthUser.fields.id.Type;
  }) => void | Promise<void>;
}) =>
  useAppForm({
    schema: CreateUserInput,
    mutation: createServerUserAtom(useAtomSuspense(activeAccountKeyAtom).value),
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
