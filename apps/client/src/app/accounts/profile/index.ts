import { Match, Schema } from 'effect';

import { useAppForm } from '#src/components/form';
import { updateCurrentUserAtom } from '#src/services/accounts/atoms.ts';

export class UserProfileUpdateInput extends Schema.Class<
  UserProfileUpdateInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/index/UserProfileUpdateInput')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
}) {}

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
          NoCurrentAuthClientError: () => 'No active user is available.',
          CurrentAuthClientRequestError: (requestError) =>
            requestError.details.message ?? 'Unable to update the profile. Try again.',
        })
      ),
    onSuccess: async () => {
      await onSuccess();
    },
  });

  return form;
};
