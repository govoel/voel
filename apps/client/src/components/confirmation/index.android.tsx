import { AlertDialog, Column, LoadingIndicator, TextButton } from '@expo/ui/jetpack-compose';

import type { ConfirmationComponent } from '#src/components/confirmation';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const Confirmation = (({ state, trigger, confirmLabel = 'Confirm', ...props }) => {
  const colors = useMaterialColors();
  const color = props.role === 'default' ? colors.primary : colors.error;
  return (
    <>
      {trigger}
      {!state.presented && state.feedback.length > 0 ? <Text>{state.feedback}</Text> : null}
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
              {state.busy ? <LoadingIndicator /> : null}
            </Column>
          </AlertDialog.Text>
          <AlertDialog.ConfirmButton>
            <TextButton
              enabled={!state.busy}
              onClick={() => {
                void state.execute();
              }}>
              <Text color={color}>{confirmLabel}</Text>
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
