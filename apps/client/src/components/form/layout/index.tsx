import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

export type FormLayoutComponent = ComponentType<
  PropsWithChildren<{
    readonly title?: string;
    readonly footer: ReactNode;
    /** Titled groups rendered after the untitled first group of `children`. */
    readonly sections?: ReadonlyArray<{
      readonly key: string;
      readonly title: string;
      readonly content: ReactNode;
    }>;
  }>
>;
export declare const FormLayout: FormLayoutComponent;
