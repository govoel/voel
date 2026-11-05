import type { ComponentType, ReactNode } from 'react';

export interface RootFieldsProps {
  readonly rows: ReadonlyArray<{ readonly key: string }>;
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  readonly renderField: (index: number) => ReactNode;
}

export declare const RootFields: ComponentType<RootFieldsProps>;
