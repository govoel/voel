import type { ComponentType } from 'react';

import type { ListStateProps } from '#src/components/list-state/schema.ts';

export type ListStateComponent = ComponentType<typeof ListStateProps.Type>;

export declare const ListState: ListStateComponent;
