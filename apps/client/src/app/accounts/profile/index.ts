import { Match, Schema } from 'effect';

import { useAppForm } from '#src/components/form';
import { updateCurrentUserAtom } from '#src/services/accounts/atoms.ts';

export class UserProfileUpdate extends Schema.Class<
  UserProfileUpdate,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/UserProfileUpdate')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
}) {}

export const useUserProfileForm = ({
  onSuccess,
  profile,
}: {
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdate.Encoded;
}) => {
  const form = useAppForm({
    schema: UserProfileUpdate,
    mutation: updateCurrentUserAtom,
    defaultValues: profile,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          'voel/services/auth-client/current/NoCurrentAuthClientError': () =>
            'No active user is available.',
          'voel/services/auth-client/current/CurrentAuthClientRequestError': (requestError) =>
            requestError.original.message ?? 'Unable to update the profile. Try again.',
        })
      ),
    onSuccess: async () => {
      await onSuccess();
    },
  });

  return form;
};
