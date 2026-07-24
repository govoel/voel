import type { ComponentType, ReactNode } from 'react';

export type TabScreenPageComponent = ComponentType<{
  readonly header?: ReactNode;
  readonly children?: ReactNode;
}>;

export declare const TabScreenPage: TabScreenPageComponent;
