import { useAtomSuspense } from '@effect/atom-react';
import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { AuthChangePasswordInput, AuthSignUpInput } from '@repo/auth-api/shared.ts';
import type { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { useAppForm } from '#src/components/form';
import {
  accountAuthClientAtom,
  activeAccountAtom,
  activeAccountKeyAtom,
} from '#src/domains/accounts/atoms.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { NoActiveAccountError } from '#src/domains/accounts/errors.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import type { ActiveAccountKey } from '#src/domains/accounts/schema.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { Account } from '#src/domains/accounts/schema.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { swr } from '#src/runtime/swr.ts';

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

const updateCurrentUserAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.fn<typeof UserProfileUpdateInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      return yield* client.updateUser(input);
    }),
    { reactivityKeys: ['auth.users'] }
  ).pipe(Atom.withLabel('updateCurrentUserAtom'))
);

export const useUserProfileForm = ({
  onSuccess,
  profile,
}: {
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdateInput.Encoded;
}) =>
  useAppForm({
    schema: UserProfileUpdateInput,
    mutation: updateCurrentUserAtom(useAtomSuspense(activeAccountKeyAtom).value),
    defaultValues: profile,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
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

const changePasswordAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthChangePasswordInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const ownSessionsAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* (get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      const current = yield* client.readSession;
      const sessions = yield* client.listSessions;
      return { sessions, currentId: current.session.id };
    })
  ).pipe(
    Atom.withReactivity(['auth.sessions']),
    swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
  )
);

export const revokeOwnSessionAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.fn<typeof AuthRevokeSessionInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.revokeSession(input);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const signOutEverywhereAtom = Atom.family((account: Option.Option<ActiveAccountKey>) =>
  AppRuntime.fn<Schema.Void['Type']>()(
    Effect.fnUntraced(function* () {
      if (Option.isNone(account)) {
        return yield* NoActiveAccountError.make();
      }
      const manager = yield* AccountManager;
      return yield* manager.signOutEverywhere(account.value);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
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
    mutation: changePasswordAtom(useAtomSuspense(activeAccountKeyAtom).value),
    onFailure: authFailureMessage,
    onSuccess,
  });
