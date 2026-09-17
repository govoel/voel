import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.android.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.ts';
import { Text } from '#src/components/text';
import { materialInputTextStyle } from '#src/constants/material.ts';

export const TextField = (({ label, placeholder, purpose, platformProps = {} }) => {
  const { field, isSubmitting, errorMessage, onFocusChange } = useTextFieldState();
  const value = useNativeState(field.state.value);

  return (
    <ComposeTextField
      {...('android' in platformProps ? platformProps.android : {})}
      textStyle={{
        ...materialInputTextStyle,
        ...('android' in platformProps ? platformProps.android.textStyle : {}),
      }}
      keyboardOptions={{
        ...(purpose ? textInputPresets[purpose] : {}),
        ...('android' in platformProps ? platformProps.android.keyboardOptions : {}),
      }}
      value={value}
      onValueChange={field.handleChange}
      onFocusChanged={onFocusChange}
      enabled={
        !isSubmitting &&
        ('android' in platformProps ? (platformProps.android.enabled ?? true) : true)
      }
      singleLine={'android' in platformProps ? (platformProps.android.singleLine ?? true) : true}
      isError={Option.isSome(errorMessage)}>
      <ComposeTextField.Label>
        <Text>{label}</Text>
      </ComposeTextField.Label>

      {typeof placeholder === 'string' && placeholder.length > 0 ? (
        <ComposeTextField.Placeholder>
          <Text>{placeholder}</Text>
        </ComposeTextField.Placeholder>
      ) : null}

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (error) => (
          <ComposeTextField.SupportingText>
            <Text variant="caption">{getFormFieldErrorMessage(error)}</Text>
          </ComposeTextField.SupportingText>
        ),
      })}
    </ComposeTextField>
  );
}) satisfies TextFieldComponent;
