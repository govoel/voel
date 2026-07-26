import { Effect, Schema } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { Runtime } from '#src/services/runtime.ts';

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
    runtime: Runtime,
    schema: UserProfileUpdateInput,
    defaultValues: profile,
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      yield* CurrentAuthClient.pipe(
        Effect.flatMap((authClient) => authClient.updateUser(value)),
        Effect.catchTags({
          NoCurrentAuthClientError: () =>
            new FormSubmitError({ message: 'No active user is available.' }),
          CurrentAuthClientRequestError: (error) =>
            new FormSubmitError({
              message: error.details.message ?? 'Unable to update the profile. Try again.',
            }),
        })
      );
      yield* Effect.promise(async () => {
        await onSuccess();
      });
    }),
  });

  return form;
};
