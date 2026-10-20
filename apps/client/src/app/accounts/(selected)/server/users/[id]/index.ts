import { DateTime, Effect, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type {
  AuthAdminRevokeSessionInput,
  AuthAdminUserDetails,
  AuthUser,
  AuthUserIdInput,
} from '@repo/auth-api/shared.ts';
import {
  AuthAdminUpdateUserInput,
  AuthSetRoleInput,
  AuthSetUserPasswordInput,
} from '@repo/auth-api/shared.ts';

import { useAppForm } from '#src/components/form';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import { accountAuthClientAtom, useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { swr } from '#src/runtime/swr.ts';

export const serverUserAtom = Atom.family(
  ({
    account,
    userId,
  }: {
    readonly account: Atom.Atom<ActiveAccountKey>;
    readonly userId: typeof AuthUser.fields.id.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const client = yield* get.result(accountAuthClientAtom(account));
        const user = yield* client.admin.getUser({ userId });
        return {
          ...user,
          isOtherUser: get(account).userId !== user.id,
        };
      })
    ).pipe(
      Atom.withReactivity(['auth.users']),
      swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
    )
);

const setServerUserRoleAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthSetRoleInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.setRole(input);
    }),
    { reactivityKeys: ['auth.users'] }
  )
);

const updateServerUserAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthAdminUpdateUserInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.updateUser(input);
    }),
    { reactivityKeys: ['auth.users'] }
  )
);

const setServerUserPasswordAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthSetUserPasswordInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.setUserPassword({ userId: input.userId, newPassword: input.newPassword });
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const deleteServerUserAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthUserIdInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.removeUser(input);
    }),
    { reactivityKeys: ['auth.users', 'auth.sessions'] }
  )
);

export const serverUserSessionsAtom = Atom.family(
  ({
    account,
    userId,
  }: {
    readonly account: Atom.Atom<ActiveAccountKey>;
    readonly userId: typeof AuthUser.fields.id.Type;
  }) =>
    AppRuntime.atom(
      Effect.fnUntraced(function* (get) {
        const client = yield* get.result(accountAuthClientAtom(account));
        return yield* client.admin.listUserSessions({ userId });
      })
    ).pipe(
      Atom.withReactivity(['auth.sessions']),
      swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
    )
);

export const revokeServerUserSessionAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthAdminRevokeSessionInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.revokeUserSession(input);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);
export const revokeServerUserSessionsAtom = Atom.family((account: Atom.Atom<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthUserIdInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.admin.revokeUserSessions(input);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

class PasswordInput extends AuthSetUserPasswordInput.pipe(
  Schema.fieldsAssign({
    confirmPassword: Schema.String,
  })
).check(
  Schema.makeFilter(
    ({ newPassword, confirmPassword }) =>
      newPassword === confirmPassword || {
        path: ['confirmPassword'],
        issue: 'Passwords must match',
      }
  )
) {}

export const useUserPasswordForm = ({
  userId,
  onSuccess,
}: {
  userId: typeof AuthUser.fields.id.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: PasswordInput,
    mutation: setServerUserPasswordAtom(account),
    defaultValues: { userId, newPassword: '', confirmPassword: '' },
    onFailure: authFailureMessage,
    onSuccess,
  });
};

export const useServerUserProfileForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: AuthAdminUpdateUserInput,
    mutation: updateServerUserAtom(account),
    defaultValues: {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
    },
    onFailure: authFailureMessage,
    onSuccess,
  });
};

export const useUserRoleForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: AuthSetRoleInput,
    mutation: setServerUserRoleAtom(account),
    defaultValues: { userId: user.id, role: user.role },
    onFailure: authFailureMessage,
    onSuccess,
  });
};

export const userDetails = ({ user }: { readonly user: typeof AuthAdminUserDetails.Type }) => [
  { label: 'User ID', value: user.id },
  { label: 'Name', value: user.name },
  { label: 'Username', value: `@${user.username}` },
  { label: 'Email', value: user.email },
  { label: 'Role', value: Account.roleToDisplayString(user.role) },
  {
    label: 'Created',
    value: DateTime.formatLocal(user.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
  },
  {
    label: 'Updated',
    value: DateTime.formatLocal(user.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }),
  },
];
