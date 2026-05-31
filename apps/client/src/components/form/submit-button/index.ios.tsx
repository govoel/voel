import { Button, VStack } from '@expo/ui/swift-ui';
import { disabled as disabledModifier, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useStore } from '@tanstack/react-form';
import { PlatformColor } from 'react-native';

import { useFormContext, useFormSubmitError } from '#src/components/form/hooks.ts';
import type { SubmitButtonComponent } from '#src/components/form/submit-button';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const SubmitButton = (({ children, disabled = false, platformProps = {} }) => {
  const form = useFormContext();
  const submitError = useFormSubmitError();
  const [canSubmit, isSubmitting, formErrorMessages] = useStore(
    form.store,
    (state): readonly [boolean, boolean, string[]] => [
      state.canSubmit,
      state.isSubmitting,
      state.errors.filter((error) => typeof error === 'string' && error.length > 0),
    ]
  );

  const errorMessages = [
    ...new Set(
      submitError === null ? formErrorMessages : [...formErrorMessages, submitError.message]
    ),
  ];

  return (
    <>
      <VStack alignment="leading" spacing={Spacing.one}>
        {errorMessages.map((message) => (
          <Text key={message} modifiers={[foregroundStyle(PlatformColor('systemRed'))]}>
            {message}
          </Text>
        ))}
      </VStack>

      <Button
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
          disabledModifier(!canSubmit || isSubmitting || disabled),
        ]}
        onPress={() => {
          void form.handleSubmit();
        }}>
        {children}
      </Button>
    </>
  );
}) satisfies SubmitButtonComponent;
