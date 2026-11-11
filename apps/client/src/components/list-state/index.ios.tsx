import { Button, HStack, ProgressView } from '@expo/ui/swift-ui';
import { containerRelativeFrame, disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';

import type { ListStateComponent } from '#src/components/list-state';
import { ListStateProps } from '#src/components/list-state/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const ListState = ListStateProps.match({
  loading: () => (
    <ProgressView
      modifiers={[containerRelativeFrame({ axes: 'horizontal', alignment: 'center' })]}
    />
  ),
  empty: ({ message }) => (
    <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
      {message}
    </Text>
  ),
  message: ({ message }) => (
    <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>{message}</Text>
  ),
  error: (props) => (
    <>
      <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
        {props.message}
      </Text>
      <Button onPress={props.onRetry} modifiers={[disabled(props.retrying)]}>
        <HStack alignment="center" spacing={Spacing.one}>
          {props.retrying ? <ProgressView /> : null}
          <Text>Retry</Text>
        </HStack>
      </Button>
    </>
  ),
}) satisfies ListStateComponent;
