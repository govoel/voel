import type { TextFieldProps as ComposeTextFieldProps } from '@expo/ui/jetpack-compose';
import type { TextFieldProps as SwiftTextFieldProps } from '@expo/ui/swift-ui';
import type { ComponentType } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

export type TextFieldComponent = ComponentType<{
  label: string;
  purpose?: TextInputPurpose;
  placeholder: string;
  platformProps?:
    | { ios: Omit<SwiftTextFieldProps, 'placeholder' | 'ref'> }
    | { android: Omit<ComposeTextFieldProps, 'visualTransformation' | 'ref'> };
}>;

export declare const TextField: TextFieldComponent;
