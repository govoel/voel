import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

export type PanelComponent = ComponentType<PropsWithChildren<{ readonly title: string }>>;

export type ActionComponent = ComponentType<{
  readonly title: string;
  readonly onPress: () => void;
  readonly busy?: boolean;
}>;

export type PageComponent = ComponentType<PropsWithChildren>;

export type EditorSheetComponent = ComponentType<{
  readonly title: string;
  readonly children: (props: { readonly onSuccess: () => void | Promise<void> }) => ReactNode;
}>;

export type FormLayoutComponent = ComponentType<
  PropsWithChildren<{
    readonly title: string;
    readonly footer: ReactNode;
  }>
>;

export declare const Panel: PanelComponent;
export declare const Action: ActionComponent;
export declare const Page: PageComponent;
export declare const EditorSheet: EditorSheetComponent;
export declare const FormLayout: FormLayoutComponent;
