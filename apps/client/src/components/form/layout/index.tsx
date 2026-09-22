import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

export type FormLayoutComponent = ComponentType<
  PropsWithChildren<{ readonly title?: string; readonly footer: ReactNode }>
>;
export declare const FormLayout: FormLayoutComponent;
