import type { ComponentType, ReactNode } from 'react';

export type CenteredTabScreenPageComponent = ComponentType<{
  readonly header?: ReactNode;
  readonly children: ReactNode;
}>;

export declare const CenteredTabScreenPage: CenteredTabScreenPageComponent;
