import { Effect } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import type { UserProfileEditorProps } from '#src/components/user-profile-editor/index.ts';
import { AccountManager, UserProfileUpdate } from '#src/services/accounts/index.ts';
import { Runtime } from '#src/services/runtime.ts';

export const useUserProfileForm = ({
  onProfileUpdated,
  profile,
}: {
  readonly onProfileUpdated: () => void;
  readonly profile: UserProfileEditorProps['profile'];
}) => {
  const form = useAppForm({
    runtime: Runtime,
    schema: UserProfileUpdate,
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
