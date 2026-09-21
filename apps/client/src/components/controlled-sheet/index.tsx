import type { ComponentType, ReactNode } from 'react';

export type ControlledSheetComponent = ComponentType<{
  readonly presented: boolean;
  readonly onDismiss: () => void;
  readonly children: (props: { readonly close: () => Promise<void> }) => ReactNode;
}>;
export declare const ControlledSheet: ControlledSheetComponent;
