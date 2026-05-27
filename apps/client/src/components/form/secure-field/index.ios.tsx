import { Label, SecureField as SwiftSecureField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useStore } from '@tanstack/react-form';
import { PlatformColor } from 'react-native';

import { iosTextStyle } from '#modules/design-system/index.ts';
import { useFieldContext, useFormContext } from '#src/components/form/hooks.ts';
import type { SecureFieldComponent } from '#src/components/form/secure-field';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const SecureField = (({ label, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const isError = field.state.meta.isTouched && field.state.meta.errors.length > 0;
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>
      <SwiftSecureField
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
      {isError ? (
        <Label
          title={field.state.meta.errors.map((error) => error.message).join(', ')}
          modifiers={[iosTextStyle('caption'), foregroundStyle(PlatformColor('systemRed'))]}
        />
      ) : null}
    </VStack>
  );
}) satisfies SecureFieldComponent;
