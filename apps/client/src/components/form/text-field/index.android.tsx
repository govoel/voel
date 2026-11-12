import {
  TextField as ComposeTextField,
  OutlinedTextField,
  useNativeState,
} from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { useEffect, useRef } from 'react';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.android.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text';
import { materialInputTextStyle } from '#src/constants/material.ts';

export const TextField = (({ label, placeholder, purpose, platformProps = {} }) => {
  const { field, isSubmitting, errorMessage, onFocusChange } = useTextFieldState();
  const value = useNativeState(field.state.value);
  const lastNativeChange = useRef(field.state.value);
  useEffect(() => {
    if (lastNativeChange.current !== field.state.value) {
      value.set(field.state.value);
      lastNativeChange.current = field.state.value;
    }
  }, [value, field.state.value]);
  const handleChange = (text: string) => {
    lastNativeChange.current = text;
    field.handleChange(text);
  };
  const { variant = 'filled', ...androidProps } =
    'android' in platformProps ? platformProps.android : {};
  const NativeTextField = variant === 'outlined' ? OutlinedTextField : ComposeTextField;

  return (
    <NativeTextField
      {...androidProps}
      textStyle={{
        ...materialInputTextStyle,
        ...('android' in platformProps ? platformProps.android.textStyle : {}),
      }}
      keyboardOptions={{
        ...(purpose !== void 0 ? textInputPresets[purpose] : {}),
        ...('android' in platformProps ? platformProps.android.keyboardOptions : {}),
      }}
      value={value}
      onValueChange={handleChange}
      onFocusChanged={onFocusChange}
      enabled={
        !isSubmitting &&
        ('android' in platformProps ? (platformProps.android.enabled ?? true) : true)
      }
      singleLine={'android' in platformProps ? (platformProps.android.singleLine ?? true) : true}
      isError={Option.isSome(errorMessage)}>
      <NativeTextField.Label>
        <Text>{label}</Text>
      </NativeTextField.Label>

      <NativeTextField.Placeholder>
        <Text>{placeholder}</Text>
      </NativeTextField.Placeholder>

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (error) => (
          <NativeTextField.SupportingText>
            <Text variant="caption">{getFormFieldErrorMessage(error)}</Text>
          </NativeTextField.SupportingText>
        ),
      })}
    </NativeTextField>
  );
}) satisfies TextFieldComponent;
