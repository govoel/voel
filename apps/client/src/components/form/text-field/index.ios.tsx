import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { useCallback, useRef } from 'react';
import { PlatformColor } from 'react-native';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.ios.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

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
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftTextField
        {...('ios' in platformProps ? platformProps.ios : {})}
        ref={attach}
        placeholder={placeholder}
        modifiers={[
          ...(purpose !== void 0 ? textInputPresets[purpose] : []),
          disabled(isSubmitting),
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        ]}
        text={value}
        onTextChange={handleChange}
        onFocusChange={onFocusChange}
      />

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (error) => (
          <Label
            title={getFormFieldErrorMessage(error)}
            modifiers={[
              font({ textStyle: 'caption', weight: 'regular' }),
              foregroundStyle(PlatformColor('systemRed')),
            ]}
          />
        ),
      })}
    </VStack>
  );
}) satisfies TextFieldComponent;
