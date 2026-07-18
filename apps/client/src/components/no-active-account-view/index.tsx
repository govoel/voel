import type { ComponentType, ReactNode } from 'react';

export type NoActiveAccountViewComponent = ComponentType<{
  readonly header: ReactNode;
}>;

export declare const NoActiveAccountView: NoActiveAccountViewComponent;
