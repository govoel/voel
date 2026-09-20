import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { AuthChangePasswordInput, AuthSignUpInput } from '@repo/auth-api/shared.ts';
import type { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { useAppForm } from '#src/components/form';
import {
  activeAccountAtom,
  activeAccountAuthClientAtom,
  activeAccountKeyAtom,
} from '#src/services/accounts/atoms.ts';
import { AccountManager, NoActiveAccountError } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

class UserProfileUpdateInput extends AuthSignUpInput.mapFields(({ name, username }) => ({
  name,
  username,
})) {}

export const activeUserProfileAtom = activeAccountAtom.pipe(
  Atom.map((result) =>
    result.pipe(
      AsyncResult.map(
        Option.map(({ email, name, role, userId, username }) => ({
          email,
          id: userId,
          name,
          role: Account.roleToDisplayString(role),
          username,
        }))
      )
    )
  ),
  withPredefinedStates(() => [
    {
      id: PredefinedStateId.make('loading'),
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: PredefinedStateId.make('no-active-user'),
      label: 'No active user',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: PredefinedStateId.make('loaded'),
      label: 'Loaded profile',
      atom: Atom.make(() =>
        AsyncResult.success(
          Option.some({
            email: Account.fields.email.make('reader@example.com'),
            id: Account.fields.userId.make('predefined-user'),
            name: Account.fields.name.make('Alex Reader'),
            role: Account.roleToDisplayString('admin'),
            username: Account.fields.username.make('alex'),
          })
        )
      ),
    },
  ]),
  Atom.withLabel('activeUserProfileAtom')
);

const updateCurrentUserAtom = AppRuntime.fn<typeof UserProfileUpdateInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    return yield* client.updateUser(input);
  }),
  { reactivityKeys: ['auth.users'] }
).pipe(Atom.withLabel('updateCurrentUserAtom'));

export const useUserProfileForm = ({
  onSuccess,
  profile,
}: {
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdateInput.Encoded;
}) =>
  useAppForm({
    schema: UserProfileUpdateInput,
    mutation: updateCurrentUserAtom,
    defaultValues: profile,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          AccountDatabaseError: () => 'Unable to update the profile. Try again.',
          NoActiveAccountError: () => 'No active user is available.',
          BetterAuthClientInitializationError: () =>
            'Unexpected error during authentication. Try again.',
          AuthError: (authError) =>
            Match.value(authError.reason).pipe(
              Match.tagsExhaustive({
                BetterAuthApiError: ({ message }) =>
                  message || 'Unable to update the profile. Try again.',
                AuthTransportError: () =>
                  'Unable to reach the server. Check your connection and try again.',
                InvalidAuthInputError: () => 'Check the profile details and try again.',
                InvalidAuthResponseError: () =>
                  'The server returned an invalid authentication response. Try again.',
              })
            ),
        })
      ),
    onSuccess: async () => {
      await onSuccess();
    },
  });

const changePasswordAtom = AppRuntime.fn<typeof AuthChangePasswordInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
  }),
  { reactivityKeys: ['auth.sessions'] }
);

export const ownSessionsAtom = AppRuntime.atom(
  Effect.fnUntraced(function* (get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    const current = yield* client.readSession;
    const sessions = yield* client.listSessions;
    return { sessions, currentId: current.session.id };
  })
).pipe(
  Atom.withReactivity(['auth.sessions']),
  swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
);

export const revokeOwnSessionAtom = AppRuntime.fn<typeof AuthRevokeSessionInput.Type>()(
  Effect.fnUntraced(function* (input, get) {
    const client = yield* get.result(activeAccountAuthClientAtom);
    yield* client.revokeSession(input);
  }),
  { reactivityKeys: ['auth.sessions'] }
);

export const signOutEverywhereAtom = AppRuntime.fn<Schema.Void['Type']>()(
  Effect.fnUntraced(function* (_, get) {
    const key = yield* get.result(activeAccountKeyAtom);
    if (Option.isNone(key)) {
      return yield* NoActiveAccountError.make();
    }
    const manager = yield* AccountManager;
    return yield* manager.signOutEverywhere(key.value);
  }),
  { reactivityKeys: ['auth.sessions'] }
);

class PasswordFormInput extends AuthChangePasswordInput.pipe(
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

export const useChangePasswordForm = ({ onSuccess }: { onSuccess: () => void | Promise<void> }) =>
  useAppForm({
    schema: PasswordFormInput,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mutation: changePasswordAtom,
    onFailure: authFailureMessage,
    onSuccess,
  });
