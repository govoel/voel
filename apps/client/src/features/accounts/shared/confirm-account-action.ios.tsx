import { Button } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';

import { Text } from '#src/components/text';

import type { authFailureMessage } from './auth-errors.ts';
import { useConfirmAccountAction } from './use-confirm-account-action.ts';

export const ConfirmAccountAction = <
  Input,
  Success,
  Failure extends Parameters<typeof authFailureMessage>[0]['error'],
>(
  props: Parameters<typeof useConfirmAccountAction<Input, Success, Failure>>[0]
) => {
  const { confirm, pending, feedback } = useConfirmAccountAction(props);
  return (
    <>
      <Button
        role={props.intent === 'destructive' ? 'destructive' : 'default'}
        onPress={confirm}
        modifiers={[disabled(pending)]}>
        <Text>{pending ? 'Working…' : props.title}</Text>
      </Button>
      {feedback.length > 0 ? <Text>{feedback}</Text> : null}
    </>
  );
};
