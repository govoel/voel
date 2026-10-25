import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/reactivity';

import type { AuthRevokeSessionInput } from '@repo/auth-api/shared.ts';
import { AuthChangePasswordInput, AuthSignUpInput } from '@repo/auth-api/shared.ts';
import { PredefinedStateId } from '@repo/effect-atom-devtools-core';

import { useAppForm } from '#src/components/form';
import { AuthClientMap } from '#src/domains/accounts/auth-client/index.ts';
import { authFailureMessage } from '#src/domains/accounts/components/management/auth-failure-message.ts';
import { AccountManager } from '#src/domains/accounts/manager.ts';
import { AccountRepository } from '#src/domains/accounts/repository.ts';
import { Account, AccountKey } from '#src/domains/accounts/schema.ts';
import { accountAtom, useSelectedAccount } from '#src/domains/accounts/scope.ts';
import { withPredefinedStates } from '#src/runtime/atom-devtools.ts';
import { AppRuntime } from '#src/runtime/index.ts';
import { swr } from '#src/runtime/swr.ts';

class UserProfileUpdateInput extends AuthSignUpInput.mapFields(({ name, username }) => ({
  name,
  username,
})) {}

export const activeUserProfileAtom = Atom.family((account: AccountKey) =>
  accountAtom(account).pipe(
    Atom.map(
      AsyncResult.map(
        Option.map(({ key, email, name, role, username }) => ({
          email,
          id: key.userId,
          name,
          role: Account.roleToDisplayString(role),
          username,
        }))
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
              id: AccountKey.fields.userId.make('predefined-user'),
              name: Account.fields.name.make('Alex Reader'),
              role: Account.roleToDisplayString('admin'),
              username: Account.fields.username.make('alex'),
            })
          )
        ),
      },
    ]),
    Atom.withLabel('activeUserProfileAtom')
  )
);

const updateCurrentUserAtom = Atom.family((account: AccountKey) =>
  AppRuntime.fn<typeof UserProfileUpdateInput.Type>()(
    Effect.fnUntraced(function* (input) {
      const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
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
}) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: UserProfileUpdateInput,
    mutation: updateCurrentUserAtom(account),
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
    onSuccess,
  });
};

const changePasswordAtom = Atom.family((account: AccountKey) =>
  AppRuntime.fn<typeof AuthChangePasswordInput.Type>()(
    Effect.fnUntraced(function* (input) {
      const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
      yield* client.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const ownSessionsAtom = Atom.family((account: AccountKey) =>
  AppRuntime.atom(
    Effect.fnUntraced(function* () {
      const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
      const current = yield* client.readSession;
      const sessions = yield* client.listSessions;
      return { sessions, currentId: current.session.id };
    })
  ).pipe(
    Atom.withReactivity(['auth.sessions']),
    swr({ staleTime: 0, revalidateOnMount: true, revalidateOnFocus: true })
  )
);

export const revokeOwnSessionAtom = Atom.family((account: AccountKey) =>
  AppRuntime.fn<typeof AuthRevokeSessionInput.Type>()(
    Effect.fnUntraced(function* (input) {
      const client = yield* AuthClientMap.use((clients) => clients.acquire(account));
      yield* client.revokeSession(input);
    }),
    { reactivityKeys: ['auth.sessions'] }
  )
);

export const signOutEverywhereAtom = Atom.family((account: AccountKey) =>
  AppRuntime.fn<Schema.Void['Type']>()(
    Effect.fnUntraced(function* () {
      const manager = yield* AccountManager;
      yield* manager.signOutEverywhere(account);
      const accounts = yield* AccountRepository.use((repository) => repository.list);
      return { accountsRemain: accounts.length > 0 };
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

export const useChangePasswordForm = ({ onSuccess }: { onSuccess: () => void | Promise<void> }) => {
  const account = useSelectedAccount();
  return useAppForm({
    schema: PasswordFormInput,
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mutation: changePasswordAtom(account),
    onFailure: authFailureMessage,
    onSuccess,
  });
};
