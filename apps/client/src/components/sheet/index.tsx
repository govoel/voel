import type { ComponentType, ReactNode } from 'react';

/** Mount one Sheet per opening and remove it only after onDismissed. */
export type SheetComponent = ComponentType<{
  readonly onDismissed: () => void;
  readonly children: (props: { readonly dismiss: () => void }) => ReactNode;
}>;
export declare const Sheet: SheetComponent;
