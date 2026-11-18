import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';

import { useNativeTextSync, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.android.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text';
import { materialInputTextStyle } from '#src/constants/material.ts';

export const TextField = (({
  label,
  labelVisibility = 'visible',
  placeholder,
  purpose,
  platformProps = {},
}) => {
  const { field, isSubmitting, errorMessage, onFocusChange } = useTextFieldState();
  const value = useNativeState(field.state.value);
  const handleChange = useNativeTextSync({ text: value });

  return (
    <ComposeTextField
      {...('android' in platformProps ? platformProps.android : {})}
      modifiers={[
        ...(labelVisibility === 'hidden' ? [semantics({ contentDescription: label })] : []),
        // Form fields fill the form's width unless the caller lays them out.
        ...(('android' in platformProps ? platformProps.android.modifiers : void 0) ?? [
          fillMaxWidth(),
        ]),
      ]}
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
      {labelVisibility === 'visible' ? (
        <ComposeTextField.Label>
          <Text>{label}</Text>
        </ComposeTextField.Label>
      ) : null}

      <ComposeTextField.Placeholder>
        <Text>{placeholder}</Text>
      </ComposeTextField.Placeholder>

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (message) => (
          <ComposeTextField.SupportingText>
            <Text variant="caption">{message}</Text>
          </ComposeTextField.SupportingText>
        ),
      })}
    </ComposeTextField>
  );
}) satisfies TextFieldComponent;
