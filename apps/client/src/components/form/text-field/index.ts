import type { TextFieldProps as ComposeTextFieldProps } from '@expo/ui/jetpack-compose';
import type { TextFieldProps as SwiftTextFieldProps } from '@expo/ui/swift-ui';
import type { ComponentType } from 'react';

export type TextFieldComponent = ComponentType<{
  label: string;
  placeholder?: string;
  platformProps?:
    | { ios: SwiftTextFieldProps }
    | { android: Omit<ComposeTextFieldProps, 'visualTransformation'> };
}>;

export declare const TextField: TextFieldComponent;
