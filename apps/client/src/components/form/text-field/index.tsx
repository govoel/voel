import type { TextFieldProps as ComposeTextFieldProps } from '@expo/ui/jetpack-compose';
import type { TextFieldProps as SwiftTextFieldProps } from '@expo/ui/swift-ui';
import type { ComponentType, ReactNode } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

export type TextFieldComponent = ComponentType<{
  label: string;
  labelVisibility?: 'visible' | 'hidden';
  purpose?: TextInputPurpose;
  placeholder: string;
  platformProps?:
    | { ios: Omit<SwiftTextFieldProps, 'placeholder'> }
    | {
        android: Omit<ComposeTextFieldProps, 'visualTransformation'> & {
          /** Shown at the end of the field, like a button that acts on its text. */
          trailingIcon?: ReactNode;
        };
      };
}>;

export declare const TextField: TextFieldComponent;
