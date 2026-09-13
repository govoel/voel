import { Button, useMaterialColors } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

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
  const colors = useMaterialColors();
  return (
    <>
      <Button
        onClick={confirm}
        enabled={!pending}
        modifiers={[fillMaxWidth()]}
        colors={
          props.intent === 'destructive'
            ? { containerColor: colors.error, contentColor: colors.onError }
            : {}
        }>
        <Text>{pending ? 'Working…' : props.title}</Text>
      </Button>
      {feedback.length > 0 ? <Text>{feedback}</Text> : null}
    </>
  );
};
