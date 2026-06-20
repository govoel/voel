import { Label, SecureField as SwiftSecureField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import { useRef } from 'react';
import { PlatformColor } from 'react-native';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';
import type { SecureFieldComponent } from '#src/components/form/secure-field';
import { Text, iosTextStyle } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const SecureField = (({ label, placeholder, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const errorMessage = field.state.meta.isTouched
    ? Array.head(field.state.meta.errors)
    : Option.none();
  // oxlint-disable-next-line typescript/no-deprecated - waiting for useSelector in upstream
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);
  const hasFocusedRef = useRef(false);

  return (
    <VStack alignment="leading" spacing={Spacing.one}>
      <Text variant="caption">{label}</Text>

      <SwiftSecureField
        {...(typeof placeholder === 'string' ? { placeholder } : {})}
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          disabled(isSubmitting),
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
        ]}
        text={value}
        onTextChange={field.handleChange}
        onFocusChange={(focused) => {
          // Keep blur semantics in parity with Android: only a field that has actually gained
          // focus should become touched. This avoids exposing whole-form onChange validation
          // for fields the user has not interacted with.
          if (focused) {
            hasFocusedRef.current = true;
            return;
          }

          if (!hasFocusedRef.current) {
            return;
          }

          field.handleBlur();
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
}) satisfies SecureFieldComponent;
