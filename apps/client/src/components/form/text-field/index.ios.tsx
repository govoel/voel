import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import { PlatformColor } from 'react-native';

import { iosTextStyle } from '#modules/design-system/index.ts';
import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import type { TextFieldComponent } from '#src/components/form/text-field';
import { Text } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const TextField = (({ label, placeholder, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const errorMessage = field.state.meta.isTouched
    ? Array.head(field.state.meta.errors)
    : Option.none();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftTextField
        {...(typeof placeholder === 'string' ? { placeholder } : {})}
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          disabled(isSubmitting),
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        ]}
        text={value}
        onTextChange={field.handleChange}
        onFocusChange={(focused) => {
          if (!focused) {
            field.handleBlur();
          }
        }}
      />

      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: ({ message }) => (
          <Label
            title={message}
            modifiers={[iosTextStyle('caption'), foregroundStyle(PlatformColor('systemRed'))]}
          />
        ),
      })}
    </VStack>
  );
}) satisfies TextFieldComponent;
