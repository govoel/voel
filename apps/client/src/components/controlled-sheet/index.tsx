import type { ComponentType, ReactNode } from 'react';

export type ControlledSheetComponent = ComponentType<{
  readonly presented: boolean;
  /** A logical close request, not a native dismissal-completed notification. */
  readonly onDismissRequest: () => void;
  readonly children: (props: { readonly close: () => void }) => ReactNode;
}>;
export declare const ControlledSheet: ControlledSheetComponent;
