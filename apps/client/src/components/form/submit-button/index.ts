import type { ButtonProps as ComposeButtonProps } from '@expo/ui/jetpack-compose';
import type { ButtonProps as SwiftButtonProps } from '@expo/ui/swift-ui';
import type { ComponentType, ReactElement } from 'react';

export type SubmitButtonComponent = ComponentType<{
  children: ReactElement | ReactElement[];
  disabled?: boolean;
  platformProps?:
    | { ios: Omit<SwiftButtonProps, 'children'> }
    | { android: Omit<ComposeButtonProps, 'children' | 'enabled'> };
}>;

export declare const SubmitButton: SubmitButtonComponent;
