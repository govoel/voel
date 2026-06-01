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

  return (
    <>
      {Option.match(errorMessage, {
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
      })}

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
