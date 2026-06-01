import { Button, LoadingIndicator, Row, useMaterialColors } from '@expo/ui/jetpack-compose';
import { padding } from '@expo/ui/jetpack-compose/modifiers';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';

import { useFormContext, useFormSubmitError } from '#src/components/form/hooks.ts';
import type { SubmitButtonComponent } from '#src/components/form/submit-button';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const SubmitButton = (({
  children,
  disabled = false,
  platformProps = {},
  containerModifiers = {},
}) => {
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

  const errorMessage = Option.firstSomeOf([submitError, Array.head(formErrorMessages)]);

  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <>
      {Option.match(errorMessage, {
        onNone: () => null,
        onSome: (message) => (
          <Text color={colors.error} modifiers={[padding(0, 0, 0, Spacing.one)]}>
            {message}
          </Text>
        ),
      })}

      <Button
        {...('android' in platformProps ? platformProps.android : {})}
        enabled={canSubmit && !isSubmitting && !disabled}
        onClick={() => {
          void form.handleSubmit();
        }}>
        <Row
          horizontalAlignment="center"
          verticalAlignment="center"
          horizontalArrangement={{ spacedBy: Spacing.one }}
          {...('android' in containerModifiers ? { modifiers: containerModifiers.android } : {})}>
          {isSubmitting ? <LoadingIndicator /> : null}
          {children}
        </Row>
      </Button>
    </>
  );
}) satisfies SubmitButtonComponent;
