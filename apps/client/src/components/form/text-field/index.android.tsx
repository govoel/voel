import { TextField as ComposeTextField, useNativeState } from '@expo/ui/jetpack-compose';
import { Option } from 'effect';
import { useCallback, useRef } from 'react';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.android.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text';
import { materialInputTextStyle } from '#src/constants/material.ts';

export const TextField = (({ label, placeholder, purpose, platformProps = {} }) => {
  const {
    field,
    value: fieldValue,
    isSubmitting,
    errorMessage,
    onFocusChange,
  } = useTextFieldState();
  const value = useNativeState(fieldValue);
  const lastSyncedText = useRef(fieldValue);
  const { store } = field;
  const attach = useCallback(() => {
    const syncToNative = () => {
      const text = store.state.value;
      if (lastSyncedText.current !== text) {
        lastSyncedText.current = text;
        value.set(text);
      }
    };
    const subscription = store.subscribe(syncToNative);
    syncToNative();
    return () => {
      subscription.unsubscribe();
    };
  }, [store, value]);
  const handleChange = (text: string) => {
    lastSyncedText.current = text;
    field.handleChange(text);
  };

  return (
    <ComposeTextField
      {...('android' in platformProps ? platformProps.android : {})}
      ref={attach}
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
      <ComposeTextField.Label>
        <Text>{label}</Text>
      </ComposeTextField.Label>

      <ComposeTextField.Placeholder>
        <Text>{placeholder}</Text>
      </ComposeTextField.Placeholder>

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
