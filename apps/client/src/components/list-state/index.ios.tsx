import { Button, HStack, ProgressView } from '@expo/ui/swift-ui';
import { containerRelativeFrame, disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';

import type { ListStateComponent } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const ListState = ((props) => {
  if (props.kind === 'loading') {
    return (
      <ProgressView
        modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
      />
    );
  }

  return (
    <>
      <Text
        modifiers={[
          foregroundStyle({
            type: 'hierarchical',
            style: props.kind === 'empty' ? 'secondary' : 'primary',
          }),
        ]}>
        {props.message}
      </Text>
      {props.kind === 'error' ? (
        <Button onPress={props.onRetry} modifiers={[disabled(props.retrying)]}>
          <HStack alignment="center" spacing={Spacing.one}>
            {props.retrying ? <ProgressView /> : null}
            <Text>Retry</Text>
          </HStack>
        </Button>
      ) : null}
    </>
  );
}) satisfies ListStateComponent;
