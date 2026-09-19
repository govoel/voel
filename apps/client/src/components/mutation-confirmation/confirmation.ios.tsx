import { BottomSheet, Button, ProgressView, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  fixedSize,
  frame,
  interactiveDismissDisabled,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import type { ConfirmationComponent } from '#src/components/mutation-confirmation/confirmation';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const Confirmation = (({ state, trigger, confirmLabel = 'Confirm', ...props }) => {
  const role = props.role === 'default' ? {} : { role: 'destructive' as const };
  return (
    <BottomSheet
      anchor={trigger}
      fitToContents
      isPresented={state.presented}
      onIsPresentedChange={(visible) => {
        if (!visible) {
          state.handleDismiss();
        }
      }}>
      {state.presented ? (
        <VStack
          alignment="leading"
          spacing={Spacing.two}
          modifiers={[
            interactiveDismissDisabled(state.busy),
            padding({ horizontal: Spacing.three, top: Spacing.four, bottom: Spacing.three }),
          ]}>
          <Text variant="h3">{props.title}</Text>
          <Text modifiers={[fixedSize({ horizontal: false, vertical: true })]}>
            {props.message}
          </Text>
          {state.feedback.length > 0 ? <Text>{state.feedback}</Text> : null}
          {state.busy ? <ProgressView /> : null}
          <Button
            {...role}
            onPress={() => {
              void state.execute();
            }}
            modifiers={[buttonStyle('bordered'), disabled(state.busy)]}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>{confirmLabel}</Text>
          </Button>
          <Button
            role="cancel"
            onPress={state.handleDismiss}
            modifiers={[buttonStyle('bordered'), disabled(state.busy)]}>
            <Text modifiers={[frame({ maxWidth: Infinity })]}>Cancel</Text>
          </Button>
        </VStack>
      ) : null}
    </BottomSheet>
  );
}) satisfies ConfirmationComponent;
