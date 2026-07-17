import type { ComponentType } from 'react';

export interface UserProfileValues {
  readonly name: string;
  readonly username: string;
}

export type UserProfileEditorComponent = ComponentType<{
  readonly onProfileUpdated: () => void;
  readonly profile: UserProfileValues;
}>;

export declare const UserProfileEditor: UserProfileEditorComponent;
