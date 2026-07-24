import type { ComponentType } from 'react';

import type { UserProfileUpdate } from '#src/services/accounts/index.ts';

export interface UserProfileEditorProps {
  readonly onProfileUpdated: () => void;
  readonly profile: Pick<UserProfileUpdate, 'name' | 'username'>;
}

export type UserProfileEditorComponent = ComponentType<UserProfileEditorProps>;

export declare const UserProfileEditor: UserProfileEditorComponent;
