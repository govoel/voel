import type { TextFieldProps as ComposeTextFieldProps } from '@expo/ui/jetpack-compose';
import type { SecureFieldProps as SwiftSecureFieldProps } from '@expo/ui/swift-ui';
import type { ComponentType } from 'react';

export type SecureFieldComponent = ComponentType<{
  label: string;
  platformProps?:
    | { ios: SwiftSecureFieldProps }
    | { android: Omit<ComposeTextFieldProps, 'visualTransformation'> };
}>;

export declare const SecureField: SecureFieldComponent;
