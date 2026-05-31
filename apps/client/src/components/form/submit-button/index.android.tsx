import { Button, Column, useMaterialColors } from '@expo/ui/jetpack-compose';
import { useStore } from '@tanstack/react-form';

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

  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <>
      <Column verticalArrangement={{ spacedBy: Spacing.one }}>
        {errorMessages.map((message) => (
          <Text key={message} color={colors.error}>
            {message}
          </Text>
        ))}
      </Column>

      <Button
        {...('android' in platformProps ? platformProps.android : {})}
        enabled={canSubmit && !isSubmitting && !disabled}
        onClick={() => {
          void form.handleSubmit();
        }}>
        {children}
      </Button>
    </>
  );
}) satisfies SubmitButtonComponent;
