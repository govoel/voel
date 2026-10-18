import {
  AnimatedVisibility,
  Button,
  EnterTransition,
  ExitTransition,
  LoadingIndicator,
  Row,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { padding, size } from '@expo/ui/jetpack-compose/modifiers';
import { Option } from 'effect';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import type { SubmitButtonComponent } from '#src/components/form/submit-button/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const SubmitButton = (({
  children,
  disabled = false,
  platformProps = { android: { variant: 'default' } },
  containerModifiers = {},
}) => {
  const { form, canSubmit, isSubmitting, errorMessage } = useSubmitState();
  const colors = useMaterialColors();
  const ButtonComponent =
    'android' in platformProps && platformProps.android.variant === 'text' ? TextButton : Button;

  return (
    <>
      <Row>
        {Option.match(errorMessage, {
          onNone: () => null,
          onSome: (message) => (
            <Text color={colors.error} modifiers={[padding(0, 0, 0, Spacing.one)]}>
              {message}
            </Text>
          ),
        })}
      </Row>

      <Row>
        <ButtonComponent
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
        </ButtonComponent>
      </Row>
    </>
  );
}) satisfies SubmitButtonComponent;
