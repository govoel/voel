import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { useAppForm } from '#src/components/form';
import { activeAccountAtom } from '#src/services/accounts/atoms.ts';
import { AccountManager, NoActiveAccountError } from '#src/services/accounts/index.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
import { acquireAuthClient } from '#src/services/auth-client/index.ts';
import type { AuthClient } from '#src/services/auth-client/index.ts';
import { Account } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export class UserProfileUpdateInput extends Schema.Class<
  UserProfileUpdateInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/UserProfileUpdateInput')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
}) {}

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
      id: 'loading',
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'no-active-user',
      label: 'No active user',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'loaded',
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

const updateCurrentUserAtom = AppRuntime.fn<Parameters<AuthClient['Service']['updateUser']>[0]>()(
  Effect.fnUntraced(function* (input) {
    const activeAccountKey = yield* AccountManager.use((manager) => manager.state);

    if (Option.isNone(activeAccountKey)) {
      return yield* NoActiveAccountError.make();
    }

    const authClient = yield* acquireAuthClient(activeAccountKey.value);
    return yield* authClient.updateUser(input);
  })
).pipe(Atom.withLabel('updateCurrentUserAtom'));

export const useUserProfileForm = ({
  onSuccess,
  profile,
}: {
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdateInput.Encoded;
}) => {
  const form = useAppForm({
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
                BetterAuthApiError: (authReason) =>
                  authReason.message || 'Unable to update the profile. Try again.',
                AuthTransportError: () =>
                  'Unable to reach the server. Check your connection and try again.',
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

  return form;
};
