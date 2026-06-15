import {
  AnimatedVisibility,
  Button,
  EnterTransition,
  ExitTransition,
  LoadingIndicator,
  Row,
  useMaterialColors,
} from '@expo/ui/jetpack-compose';
import { padding, size } from '@expo/ui/jetpack-compose/modifiers';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';

import { useFormContext, useFormSubmitError } from '#src/components/form/hooks.tsx';
import type { SubmitButtonComponent } from '#src/components/form/submit-button';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const SubmitErrorMessage = ({
  color,
  formErrorMessages,
}: {
  readonly color: string;
  readonly formErrorMessages: string[];
}) => {
  const submitError = useFormSubmitError();
  const errorMessage = Option.firstSomeOf([submitError, Array.head(formErrorMessages)]);

  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => (
      <Text color={color} modifiers={[padding(0, 0, 0, Spacing.one)]}>
        {message}
      </Text>
    ),
  });
};

export const SubmitButton = (({
  children,
  disabled = false,
  platformProps = {},
  containerModifiers = {},
}) => {
  const form = useFormContext();
  const [canSubmit, isSubmitting, formErrorMessages] = useStore(
    form.store,
    (state): readonly [boolean, boolean, string[]] => [
      state.canSubmit,
      state.isSubmitting,
      state.errors.filter((error) => typeof error === 'string' && error.length > 0),
    ]
  );

  const colors = useMaterialColors({ seedColor: '#00AAFF' });

  return (
    <>
      <Row>
        <SubmitErrorMessage color={colors.error} formErrorMessages={formErrorMessages} />
      </Row>

      <Row>
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
            modifiers={[...('android' in containerModifiers ? containerModifiers.android : [])]}>
            <AnimatedVisibility
              visible={isSubmitting}
              enterTransition={EnterTransition.fadeIn().plus(EnterTransition.expandHorizontally())}
              exitTransition={ExitTransition.fadeOut().plus(ExitTransition.shrinkHorizontally())}>
              <LoadingIndicator modifiers={[size(Spacing.four, Spacing.four)]} />
            </AnimatedVisibility>

            {children}
          </Row>
        </Button>
      </Row>
    </>
  );
}) satisfies SubmitButtonComponent;
