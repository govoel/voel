import { Label, TextField as SwiftTextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import { useRef } from 'react';
import { PlatformColor } from 'react-native';

import {
  getFormFieldErrorMessage,
  useFieldContext,
  useFormContext,
  useFormMutationError,
} from '#src/components/form/hooks.tsx';
import type { TextFieldComponent } from '#src/components/form/text-field/index.ts';
import { Text, iosTextStyle } from '#src/components/text/index.ios.tsx';
import { Spacing } from '#src/constants/theme.ts';

export const TextField = (({ label, placeholder, platformProps = {} }) => {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const mutationError = useFormMutationError().fields[field.name];
  const validationError = field.state.meta.isTouched
    ? Array.head(field.state.meta.errors)
    : Option.none();
  const errorMessage = mutationError === void 0 ? validationError : Option.some(mutationError);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const value = useNativeState(field.state.value);
  const hasFocusedRef = useRef(false);

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
