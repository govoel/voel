import { Effect, Option } from 'effect';

import { FormSubmitError } from '#src/components/form';
import type { UpdateUserProfile } from '#src/components/user-profile-editor';
import { AccountManager } from '#src/services/accounts/index.ts';

export const updateActiveUserProfile = Effect.fnUntraced(function* (profile) {
  const manager = yield* AccountManager;
  const activeAccount = yield* manager.state;

  if (Option.isNone(activeAccount)) {
    return yield* new FormSubmitError({ message: 'No active user is available.' });
  }

  const { authClient } = activeAccount.value.state;
  const updateResult = yield* Effect.tryPromise({
    try: async () => authClient.updateUser(profile),
    catch: () => new FormSubmitError({ message: 'Unable to update the profile. Try again.' }),
  });

  if (updateResult.error !== null) {
    return yield* new FormSubmitError({
      message: updateResult.error.message ?? 'Unable to update the profile. Try again.',
    });
  }

  return void 0;
}) satisfies UpdateUserProfile;
