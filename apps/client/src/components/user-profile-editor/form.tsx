import { Effect, Schema } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import type { UserProfileValues } from '#src/components/user-profile-editor/index.ts';
import { AccountManager } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

export class UserProfileSchema extends Schema.Class<
  UserProfileSchema,
  { readonly brand: unique symbol }
>('voel/components/user-profile-editor/UserProfileSchema')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(
    Schema.isMinLength(3, { message: 'Username must be at least 3 characters' }),
    Schema.isMaxLength(30, { message: 'Username must be at most 30 characters' }),
    Schema.isPattern(/^[a-zA-Z0-9_.]+$/u, {
      message: 'Username can only contain letters, numbers, underscores, and periods',
    })
  ),
}) {}

export const useUserProfileForm = ({
  onProfileUpdated,
  profile,
}: {
  readonly onProfileUpdated: () => void;
  readonly profile: UserProfileValues;
}) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: UserProfileSchema,
    defaultValues: profile,
    onSubmit: Effect.fnUntraced(function* ({ value }) {
      const accountManager = yield* AccountManager;
      yield* accountManager.updateActiveUserProfile(value).pipe(
        Effect.catchTags({
          'voel/services/accounts/index/ActiveAccountNotFoundError': () =>
            new FormSubmitError({ message: 'No active user is available.' }),
          'voel/services/accounts/index/UserProfileUpdateError': (error) =>
            new FormSubmitError({
              message: error.original.message ?? 'Unable to update the profile. Try again.',
            }),
        })
      );
      onProfileUpdated();
    }),
  });

  return form;
};
