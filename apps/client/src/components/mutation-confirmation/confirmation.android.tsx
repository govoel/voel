import {
  AlertDialog,
  AnimatedVisibility,
  Column,
  EnterTransition,
  ExitTransition,
  LoadingIndicator,
  Row,
  TextButton,
} from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';

import type { ConfirmationComponent } from '#src/components/mutation-confirmation/confirmation';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const Confirmation = (({ state, trigger, confirmLabel = 'Confirm', ...props }) => {
  const colors = useMaterialColors();
  const color = props.role === 'default' ? colors.primary : colors.error;
  return (
    <>
      {trigger}
      {state.presented ? (
        <AlertDialog onDismissRequest={state.handleDismiss}>
          <AlertDialog.Title>
            <Text>{props.title}</Text>
          </AlertDialog.Title>
          <AlertDialog.Text>
            <Column verticalArrangement={{ spacedBy: Spacing.two }}>
              <Text>{props.message}</Text>
              {state.feedback.length > 0 ? (
                <Text color={colors.error}>{state.feedback}</Text>
              ) : null}
            </Column>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton
              enabled={!state.busy}
              onClick={() => {
                void state.execute();
              }}>
              <Row
                horizontalAlignment="center"
                verticalAlignment="center"
                horizontalArrangement={{ spacedBy: Spacing.one }}>
                <AnimatedVisibility
                  visible={state.busy}
                  enterTransition={EnterTransition.fadeIn().plus(
                    EnterTransition.expandHorizontally()
                  )}
                  exitTransition={ExitTransition.fadeOut().plus(
                    ExitTransition.shrinkHorizontally()
                  )}>
                  <LoadingIndicator modifiers={[size(Spacing.four, Spacing.four)]} />
                </AnimatedVisibility>

                <Text color={color}>{confirmLabel}</Text>
              </Row>
            </TextButton>
          </AlertDialog.ConfirmButton>
          <AlertDialog.DismissButton>
            <TextButton enabled={!state.busy} onClick={state.handleDismiss}>
              <Text>Cancel</Text>
            </TextButton>
          </AlertDialog.DismissButton>
        </AlertDialog>
      ) : null}
    </>
  );
}) satisfies ConfirmationComponent;
