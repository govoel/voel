import { Button, HStack, ProgressView } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  disabled as disabledModifier,
  foregroundStyle,
  hidden as hiddenModifier,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { useStore } from '@tanstack/react-form';
import { Array, Option } from 'effect';
import { PlatformColor } from 'react-native';

import { useFormContext, useFormSubmitError } from '#src/components/form/hooks.tsx';
import type { SubmitButtonComponent } from '#src/components/form/submit-button/index.ts';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

const SubmitErrorMessage = ({ formErrorMessages }: { readonly formErrorMessages: string[] }) => {
  const submitError = useFormSubmitError();
  const errorMessage = Option.firstSomeOf([submitError, Array.head(formErrorMessages)]);

  return Option.match(errorMessage, {
    onNone: () => null,
    onSome: (message) => (
      <Text
        modifiers={[
          foregroundStyle(PlatformColor('systemRed')),
          multilineTextAlignment('center'),
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
  // oxlint-disable-next-line typescript/no-deprecated - waiting for useSelector in upstream
  const [canSubmit, isSubmitting, formErrorMessages] = useStore(
    form.store,
    (state): readonly [boolean, boolean, string[]] => [
      state.canSubmit,
      state.isSubmitting,
      state.errors.filter((error) => typeof error === 'string' && error.length > 0),
    ]
  );

  return (
    <>
      <SubmitErrorMessage formErrorMessages={formErrorMessages} />

      <Button
        {...('ios' in platformProps ? platformProps.ios : {})}
        modifiers={[
          ...('ios' in platformProps ? (platformProps.ios.modifiers ?? []) : []),
          disabledModifier(!canSubmit || isSubmitting || disabled),
          animation(Animation.default, isSubmitting),
        ]}
        onPress={() => {
          void form.handleSubmit();
        }}>
        <HStack
          alignment="center"
          spacing={Spacing.one}
          {...('ios' in containerModifiers ? { modifiers: containerModifiers.ios } : {})}>
          {isSubmitting ? <ProgressView modifiers={[hiddenModifier(!isSubmitting)]} /> : null}

          {children}
        </HStack>
      </Button>
    </>
  );
}) satisfies SubmitButtonComponent;
