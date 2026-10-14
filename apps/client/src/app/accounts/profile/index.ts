import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import { AuthChangePasswordInput, AuthSignUpInput } from '@repo/auth-api/shared.ts';
import type { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { authFailureMessage } from '#src/components/account-management/auth-failure-message.ts';
import { useAppForm } from '#src/components/form';
import { accountAtom, accountAuthClientAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import type { AccountStorageKey } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';
import { swr } from '#src/services/swr.ts';

class UserProfileUpdateInput extends AuthSignUpInput.mapFields(({ name, username }) => ({
  name,
  username,
})) {}

export const userProfileAtom = Atom.family((accountKey: AccountStorageKey) =>
  accountAtom(accountKey).pipe(
    Atom.mapResult(
      Option.map(({ email, name, role, userId, username }) => ({
        email,
        id: userId,
        name,
        role: Account.roleToDisplayString(role),
        username,
      }))
    ),
    withPredefinedStates(() => [
      {
        id: PredefinedStateId.make('loading'),
        label: 'Loading',
        atom: Atom.make(() => AsyncResult.initial(true)),
      },
      {
        id: PredefinedStateId.make('no-user'),
        label: 'Profile unavailable',
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
    Atom.withLabel('userProfileAtom')
  )
);

const updateCurrentUserAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.fn<typeof UserProfileUpdateInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      return yield* client.updateUser(input);
    }),
    { reactivityKeys: ['auth.users'] }
  ).pipe(Atom.withLabel('updateCurrentUserAtom'))
);

export const useUserProfileForm = ({
  accountKey,
  onSuccess,
  profile,
}: {
  accountKey: AccountStorageKey;
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdateInput.Encoded;
}) =>
  useAppForm({
    schema: UserProfileUpdateInput,
    mutation: updateCurrentUserAtom(accountKey),
    defaultValues: profile,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
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

const changePasswordAtom = Atom.family((account: AccountStorageKey) =>
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

export const ownSessionsAtom = Atom.family((account: AccountStorageKey) =>
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

export const revokeOwnSessionAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.fn<typeof AuthRevokeSessionInput.Type>()(
    Effect.fnUntraced(function* (input, get) {
      const client = yield* get.result(accountAuthClientAtom(account));
      yield* client.revokeSession(input);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const signOutEverywhereAtom = Atom.family((account: AccountStorageKey) =>
  AppRuntime.fn<Schema.Void['Type']>()(
    Effect.fnUntraced(function* () {
      const manager = yield* AccountManager;
      return yield* manager.signOutEverywhere(account);
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

export const useChangePasswordForm = ({
  accountKey,
  onSuccess,
}: {
  accountKey: AccountStorageKey;
  onSuccess: () => void | Promise<void>;
}) =>
  useAppForm({
    schema: PasswordFormInput,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mutation: changePasswordAtom(accountKey),
    onFailure: authFailureMessage,
    onSuccess,
  });
