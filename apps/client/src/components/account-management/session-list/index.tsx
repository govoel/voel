import type { ComponentType } from 'react';

import type { AuthDeviceSession } from '@repo/auth-api/shared.ts';

export type SessionListComponent = ComponentType<{
  readonly sessions: ReadonlyArray<typeof AuthDeviceSession.Type>;
  readonly currentId: typeof AuthDeviceSession.fields.id.Type | null;
  readonly onSelect: (session: typeof AuthDeviceSession.Type) => void;
}>;

/** Renders rows in the parent's List/Section (iOS) or directly in LazyColumn (Android). */
export declare const SessionList: SessionListComponent;
