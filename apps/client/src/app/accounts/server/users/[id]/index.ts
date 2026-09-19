import { DateTime, Effect, Option, Predicate, Schema, SchemaGetter } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type {
  AuthAdminRevokeSessionInput,
  AuthAdminUserDetails,
  AuthUser,
  AuthUserIdInput,
} from '@repo/auth-api/shared.ts';
import {
  AuthAdminUpdateUserInput,
  AuthBanUserInput,
  AuthSetRoleInput,
  AuthSetUserPasswordInput,
} from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/app/accounts/auth-failure-message.ts';
import { useAppForm } from '#src/components/form';
import { activeAccountAuthClientAtom } from '#src/services/accounts/atoms.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

export const serverUserAtom = Atom.family((userId: typeof AuthUser.fields.id.Type) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* (get) {
      const client = yield* get.result(activeAccountAuthClientAtom);
      return yield* client.admin.getUser({ userId });
    })
  ).pipe(
    Atom.withReactivity(['auth.users']),
    swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
  )
);

const setServerUserRoleAtom = AppRuntime.fn<typeof AuthSetRoleInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.setRole(input);
  }),
  { reactivityKeys: ['auth.users'] }
);

const updateServerUserAtom = AppRuntime.fn<typeof AuthAdminUpdateUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.updateUser(input);
  }),
  { reactivityKeys: ['auth.users'] }
);

const setServerUserPasswordAtom = AppRuntime.fn<typeof AuthSetUserPasswordInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.setUserPassword({ userId: input.userId, newPassword: input.newPassword });
  }),
  { reactivityKeys: ['auth.sessions'] }
);

const banServerUserAtom = AppRuntime.fn<typeof AuthBanUserInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.banUser(input);
  }),
  { reactivityKeys: ['auth.users', 'auth.sessions'] }
);
export const unbanServerUserAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.unbanUser(input);
  }),
  { reactivityKeys: ['auth.users'] }
);

export const deleteServerUserAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.removeUser(input);
  }),
  { reactivityKeys: ['auth.users', 'auth.sessions'] }
);

export const serverUserSessionsAtom = Atom.family((userId: typeof AuthUser.fields.id.Type) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* (get) {
      const client = yield* get.result(activeAccountAuthClientAtom);
      return yield* client.admin.listUserSessions({ userId });
    })
  ).pipe(
    Atom.withReactivity(['auth.sessions']),
    swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
  )
);

export const revokeServerUserSessionAtom = AppRuntime.fn<typeof AuthAdminRevokeSessionInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.revokeUserSession(input);
  }),
  { reactivityKeys: ['auth.sessions'] }
);
export const revokeServerUserSessionsAtom = AppRuntime.fn<typeof AuthUserIdInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.admin.revokeUserSessions(input);
  }),
  { reactivityKeys: ['auth.sessions'] }
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
}) =>
  useAppForm({
    schema: PasswordInput,
    mutation: setServerUserPasswordAtom,
    defaultValues: { userId, newPassword: '', confirmPassword: '' },
    onFailure: authFailureMessage,
    onSuccess,
  });

class ProfileInput extends AuthAdminUpdateUserInput.mapFields((fields) => ({
  ...fields,
  image: Schema.String.pipe(
    Schema.decodeTo(Schema.NullOr(Schema.String), {
      decode: SchemaGetter.transform((value) => (value === '' ? null : value)),
      encode: SchemaGetter.transform((value) => value ?? ''),
    })
  ),
})) {}

export const useServerUserProfileForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) =>
  useAppForm({
    schema: ProfileInput,
    mutation: updateServerUserAtom,
    defaultValues: {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: Option.getOrElse(Option.fromNullishOr(user.image), () => ''),
    },
    onFailure: authFailureMessage,
    onSuccess,
  });

export const useUserRoleForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) =>
  useAppForm({
    schema: AuthSetRoleInput,
    mutation: setServerUserRoleAtom,
    defaultValues: { userId: user.id, role: user.role },
    onFailure: authFailureMessage,
    onSuccess,
  });

export const useBanUserForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthAdminUserDetails.Type;
  onSuccess: () => void | Promise<void>;
}) =>
  useAppForm({
    schema: AuthBanUserInput,
    mutation: banServerUserAtom,
    defaultValues: { userId: user.id, banReason: '' },
    onFailure: authFailureMessage,
    onSuccess,
  });

export const userDetails = ({ user }: { readonly user: typeof AuthAdminUserDetails.Type }) => [
  { label: 'User ID', value: user.id },
  { label: 'Username', value: `@${user.username}` },
  { label: 'Name', value: user.name },
  { label: 'Email', value: user.email },
  { label: 'Email verified', value: user.emailVerified ? 'Yes' : 'No' },
  { label: 'Role', value: user.role },
  {
    label: 'Profile image',
    value: Option.getOrElse(Option.fromNullishOr(user.image), () => 'None'),
  },
  {
    label: 'Created',
    value: DateTime.formatLocal(user.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
  },
  {
    label: 'Updated',
    value: DateTime.formatLocal(user.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }),
  },
  { label: 'Banned', value: user.banned === true ? 'Yes' : 'No' },
  { label: 'Ban reason', value: user.banReason ?? 'None' },
  {
    label: 'Ban expires',
    value: Predicate.isNotNullish(user.banExpires)
      ? DateTime.formatLocal(user.banExpires, { dateStyle: 'medium', timeStyle: 'short' })
      : 'Never',
  },
];
