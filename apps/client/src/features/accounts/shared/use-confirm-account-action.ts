import { Match } from 'effect';
import { useRef } from 'react';
import { Alert } from 'react-native';

import type { authFailureMessage } from './auth-errors.ts';
import { useAccountMutation } from './use-account-mutation.ts';

export const useConfirmAccountAction = <
  Input,
  Success,
  Failure extends Parameters<typeof authFailureMessage>[0]['error'],
>({
  mutation,
  input,
  title,
  message,
  confirmLabel,
  intent,
  successMessage,
  onSuccess,
}: Parameters<typeof useAccountMutation<Input, Success, Failure>>[0] & {
  input: Input;
  title: string;
  message: string;
  confirmLabel: string;
  intent: 'default' | 'destructive';
  successMessage: string;
  onSuccess?: () => void;
}) => {
  const { state, execute } = useAccountMutation({ mutation });
  const confirming = useRef(false);
  const confirm = () => {
    if (confirming.current || state.phase === 'pending') {
      return;
    }
    confirming.current = true;
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            confirming.current = false;
          },
        },
        {
          text: confirmLabel,
          style: intent,
          onPress: () => {
            void (async () => {
              const succeeded = await execute(input);
              confirming.current = false;
              // Navigation failures are not mutation failures and must not invite retries.
              if (succeeded) {
                onSuccess?.();
              }
            })();
          },
        },
      ],
      { cancelable: false }
    );
  };
  return {
    confirm,
    pending: state.phase === 'pending',
    feedback: Match.value(state).pipe(
      Match.when({ phase: 'failure' }, ({ message: failureMessage }) => failureMessage),
      Match.when({ phase: 'success' }, () => successMessage),
      Match.orElse(() => '')
    ),
  };
};
