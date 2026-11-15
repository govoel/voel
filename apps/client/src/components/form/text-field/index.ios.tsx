import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { Option } from 'effect';
import { PlatformColor } from 'react-native';

import { useNativeTextSync, useTextFieldState } from '#src/components/form/hooks.tsx';
import { textInputPresets } from '#src/components/form/input-presets/index.ios.ts';
import type { TextFieldComponent } from '#src/components/form/text-field/index.tsx';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

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
    <VStack alignment="leading" spacing={Spacing.one}>
      {labelVisibility === 'visible' ? <Text variant="caption">{label}</Text> : null}

      <SwiftTextField
        {...('ios' in platformProps ? platformProps.ios : {})}
        placeholder={placeholder}
        modifiers={[
          ...(purpose !== void 0 ? textInputPresets[purpose] : []),
          ...(labelVisibility === 'hidden' ? [accessibilityLabel(label)] : []),
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
}) satisfies TextFieldComponent;
