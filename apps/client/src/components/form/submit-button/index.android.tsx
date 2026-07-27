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
import { useSelector } from '@tanstack/react-form';
import { Array, Option, Predicate } from 'effect';

import { useFormContext } from '#src/components/form/hooks.tsx';
import { canSubmitOrRetry } from '#src/components/form/submit-button/index.ts';
import type { SubmitButtonComponent } from '#src/components/form/submit-button/index.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const SubmitErrorMessage = ({
  color,
  formErrorMessages,
}: {
  readonly color: string;
  readonly formErrorMessages: string[];
}) => {
  const errorMessage = Array.head(formErrorMessages);

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
  const [canSubmitOrRetryMutation, isSubmitting, formErrorMessages] = useSelector(
    form.store,
    (state): readonly [boolean, boolean, string[]] => [
      canSubmitOrRetry(state),
      state.isSubmitting,
      state.errors.filter(
        (error): error is string => Predicate.isString(error) && error.length > 0
      ),
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
          enabled={canSubmitOrRetryMutation && !isSubmitting && !disabled}
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
