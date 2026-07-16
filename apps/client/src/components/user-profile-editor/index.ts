import type { Effect } from 'effect';
import type { ComponentType } from 'react';

import type { FormSubmitError } from '#src/components/form/hooks.tsx';
import type { AccountManager } from '#src/services/accounts/index.ts';

export interface UserProfileValues {
  readonly name: string;
  readonly username: string;
}

export type UpdateUserProfile = (
  profile: UserProfileValues
) => Effect.Effect<void, FormSubmitError, AccountManager>;

export type UserProfileEditorComponent = ComponentType<{
  readonly onProfileUpdated: () => void;
  readonly profile: UserProfileValues;
  readonly updateProfile: UpdateUserProfile;
}>;

export declare const UserProfileEditor: UserProfileEditorComponent;
