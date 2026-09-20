import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { PlatformColor } from 'react-native';

import { getFormFieldErrorMessage, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.ios.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text, iosTextStyle } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const TextField = (({ label, placeholder, purpose, platformProps = {} }) => {
  const { field, isSubmitting, errorMessage, onFocusChange } = useTextFieldState();
  const value = useNativeState(field.state.value);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftTextField
        {...(typeof placeholder === 'string' ? { placeholder } : {})}
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          ...(purpose ? textInputPresets[purpose] : []),
          disabled(isSubmitting),
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        ]}
        text={value}
        onTextChange={field.handleChange}
        onFocusChange={onFocusChange}
      />

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (error) => (
          <Label
            title={getFormFieldErrorMessage(error)}
            modifiers={[iosTextStyle('caption'), foregroundStyle(PlatformColor('systemRed'))]}
          />
        ),
      })}
    </VStack>
  );
}) satisfies TextFieldComponent;
