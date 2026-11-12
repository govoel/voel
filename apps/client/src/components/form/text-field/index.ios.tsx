import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { useEffect, useRef } from 'react';
import { PlatformColor } from 'react-native';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.ios.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

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

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftTextField
        {...('ios' in platformProps ? platformProps.ios : {})}
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
