import type { ComponentType, ReactNode } from 'react';

export type ScreenHostComponent = ComponentType<{
  readonly children: (contentTopInset: number) => ReactNode;
}>;

export declare const ScreenHost: ScreenHostComponent;
