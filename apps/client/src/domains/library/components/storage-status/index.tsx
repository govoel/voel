import type { ComponentType } from 'react';

import type { StoragePluginStatus } from '@repo/spec-api/domains/library/schema.ts';

export type StorageStatusComponent = ComponentType<{
  readonly status: typeof StoragePluginStatus.Type;
}>;
export declare const StorageStatus: StorageStatusComponent;
