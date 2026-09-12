import { useAtomSet } from '@effect/atom-react';
import { Exit, Option } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { Action } from '#src/components/account-management/ui';
import { Text } from '#src/components/text';

/** Confirm destructive actions, prevent double submits, and retain failures for retry. */
export const MutationAction = <
  Input,
  Success,
  Failure extends Parameters<typeof authFailureMessage>[0]['error'],
>({
  mutation,
  input,
  title,
  message,
  onSuccess,
}: {
  mutation: Atom.AtomResultFn<Input, Success, Failure>;
  input: Input;
  title: string;
  message: string;
  onSuccess?: () => void;
}) => {
  const run = useAtomSet(mutation, { mode: 'promiseExit' });
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const execute = async () => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await run(input);
      if (Exit.isSuccess(result)) {
        setFeedback('Done.');
        onSuccess?.();
      } else {
        const error = Exit.findErrorOption(result);
        setFeedback(
          Option.isSome(error)
            ? authFailureMessage({ error: error.value })
            : 'Unable to complete the request. Refresh before retrying.'
        );
      }
    } catch {
      setFeedback('Unable to complete the request. Refresh before retrying.');
    }
    locked.current = false;
    setBusy(false);
  };
  return (
    <>
      <Action
        title={title}
        busy={busy}
        onPress={() => {
          if (locked.current) {
            return;
          }
          locked.current = true;
          Alert.alert(
            title,
            message,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  locked.current = false;
                },
              },
              {
                text: 'Confirm',
                style: 'destructive',
                onPress: () => {
                  void execute();
                },
              },
            ],
            { cancelable: false }
          );
        }}
      />
      {feedback.length > 0 ? <Text>{feedback}</Text> : null}
    </>
  );
};
