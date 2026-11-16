import { Label, SecureField as SwiftSecureField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { PlatformColor } from 'react-native';

import { useNativeTextSync, useTextFieldState } from '#src/components/form/hooks.tsx';
import { passwordInputPresets } from '#src/components/form/input-presets/index.ios.ts';
import type { SecureFieldComponent } from '#src/components/form/secure-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SecureField = (({
  label,
  placeholder,
  purpose = 'currentPassword',
  platformProps = {},
}) => {
  const { field, isSubmitting, errorMessage, onFocusChange } = useTextFieldState();
  const value = useNativeState(field.state.value);
  const handleChange = useNativeTextSync({ text: value });

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftSecureField
        {...('ios' in platformProps ? platformProps.ios : {})}
        placeholder={placeholder}
        modifiers={[
          ...passwordInputPresets[purpose],
          disabled(isSubmitting),
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        ]}
        text={value}
        onTextChange={handleChange}
        onFocusChange={onFocusChange}
      />

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (message) => (
          <Label
            title={message}
            modifiers={[
              font({ textStyle: 'caption', weight: 'regular' }),
              foregroundStyle(PlatformColor('systemRed')),
            ]}
          />
        ),
      })}
    </VStack>
  );
}) satisfies SecureFieldComponent;
