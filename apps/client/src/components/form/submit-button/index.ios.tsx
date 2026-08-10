import { Button, HStack, ProgressView } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  disabled as disabledModifier,
  fixedSize,
  foregroundStyle,
  hidden as hiddenModifier,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';
import { Array, Option, Predicate } from 'effect';
import { PlatformColor } from 'react-native';

import { useFormContext, useFormSubmissionError } from '#src/components/form/hooks.tsx';
import type { SubmitButtonComponent } from '#src/components/form/submit-button/index.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const SubmitErrorMessage = ({
  formErrorMessages,
}: {
  readonly formErrorMessages: Array<string>;
}) => {
  const errorMessage = Array.head(formErrorMessages);

  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => (
      <Text
        modifiers={[
          foregroundStyle(PlatformColor('systemRed')),
          multilineTextAlignment('center'),
          fixedSize({ horizontal: false, vertical: true }),
          padding({ bottom: Spacing.one }),
        ]}>
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
  const submissionError = useFormSubmissionError();
  const [canSubmit, isSubmitting, validationErrorMessages] = useSelector(
    form.store,
    (state): readonly [boolean, boolean, Array<string>] => [
      state.canSubmit,
      state.isSubmitting,
      state.errors.filter(
        (error): error is string => Predicate.isString(error) && error.length > 0
      ),
    ]
  );
  const formErrorMessages = Option.match(submissionError, {
    onNone: () => validationErrorMessages,
    onSome: (error) => [error, ...validationErrorMessages],
  });
  return (
    <>
      <SubmitErrorMessage formErrorMessages={formErrorMessages} />

      <Button
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
          disabledModifier(!canSubmit || isSubmitting || disabled),
        ]}
        onPress={() => {
          void form.handleSubmit();
        }}>
        <HStack
          alignment="center"
          spacing={Spacing.one}
          modifiers={[
            ...('ios' in containerModifiers ? containerModifiers.ios : []),
            ...('ios' in platformProps && platformProps.ios.disableAnimation === true
              ? []
              : [animation(Animation.default, isSubmitting)]),
          ]}>
          {isSubmitting ? <ProgressView modifiers={[hiddenModifier(!isSubmitting)]} /> : null}

          {children}
        </HStack>
      </Button>
    </>
  );
}) satisfies SubmitButtonComponent;
