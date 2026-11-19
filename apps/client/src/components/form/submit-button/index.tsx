import type { ButtonProps as ComposeButtonProps, RowProps } from '@expo/ui/jetpack-compose';
import type { HStackProps, ButtonProps as SwiftButtonProps } from '@expo/ui/swift-ui';
import type { ComponentType, ReactElement } from 'react';

export type SubmitButtonComponent = ComponentType<{
  children: ReactElement | Array<ReactElement>;
  disabled?: boolean;
  platformProps?:
    | {
        ios: Omit<SwiftButtonProps, 'children'>;
      }
    | {
        android: Omit<ComposeButtonProps, 'children' | 'enabled'> & {
          variant?: 'default' | 'text';
        };
      };
  containerModifiers?:
    | { ios: NonNullable<HStackProps['modifiers']> }
    | { android: NonNullable<RowProps['modifiers']> };
}>;

export declare const SubmitButton: SubmitButtonComponent;
