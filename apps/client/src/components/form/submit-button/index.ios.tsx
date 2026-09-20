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
import { Option } from 'effect';
import { PlatformColor } from 'react-native';

import { useSubmitState } from '#src/components/form/hooks.tsx';
import type { SubmitButtonComponent } from '#src/components/form/submit-button/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const SubmitButton = (({
  children,
  disabled = false,
  platformProps = {},
  containerModifiers = {},
}) => {
  const { form, canSubmit, isSubmitting, errorMessage } = useSubmitState();
  return (
    <>
      {Option.match(errorMessage, {
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
      })}

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
