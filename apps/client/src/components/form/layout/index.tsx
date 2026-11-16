import type { ListProps } from '@expo/ui/swift-ui';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

export type FormLayoutComponent = ComponentType<
  PropsWithChildren<{
    readonly title?: string;
    readonly footer: ReactNode;
    /** Groups shown after `children`. On iOS, these are `Section`s of the form's list. */
    readonly sections?: ReactNode;
    readonly platformProps?: { readonly ios: Pick<ListProps, 'modifiers'> };
  }>
>;
export declare const FormLayout: FormLayoutComponent;
