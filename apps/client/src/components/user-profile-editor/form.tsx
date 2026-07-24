import { Effect } from 'effect';

import { FormSubmitError, useAppForm } from '#src/components/form';
import type { UserProfileEditorProps } from '#src/components/user-profile-editor/index.ts';
import { UserProfileUpdate } from '#src/components/user-profile-editor/schema.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { Runtime } from '#src/services/runtime.ts';

const updateActiveUserProfile = Effect.fnUntraced(function* (profile: UserProfileUpdate) {
  const authClient = yield* CurrentAuthClient;
  yield* authClient.updateUser(profile);
});

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
      yield* updateActiveUserProfile(value).pipe(
        Effect.catchTags({
          'voel/services/auth-client/current/NoCurrentAuthClientError': () =>
            new FormSubmitError({ message: 'No active user is available.' }),
          'voel/services/auth-client/current/CurrentAuthClientRequestError': (error) =>
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
