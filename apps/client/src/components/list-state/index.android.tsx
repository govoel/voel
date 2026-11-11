import { LoadingIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers';

import type { ListStateComponent } from '#src/components/list-state';
import { ListStateProps } from '#src/components/list-state/schema.ts';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

const MessageState = ({
  message,
  secondary = false,
}: Pick<typeof ListStateProps.cases.message.Type, 'message'> & {
  readonly secondary?: boolean;
}) => {
  const colors = useMaterialColors();
  return (
    <SegmentedList modifiers={[fillMaxWidth()]}>
      <SegmentedListItem index={0} count={1} enabled={false}>
        <SegmentedListItem.HeadlineContent>
          <Text color={secondary ? colors.onSurfaceVariant : colors.onSurface}>{message}</Text>
        </SegmentedListItem.HeadlineContent>
      </SegmentedListItem>
    </SegmentedList>
  );
};

const ErrorState = (props: typeof ListStateProps.cases.error.Type) => {
  const colors = useMaterialColors();
  return (
    <SegmentedList modifiers={[fillMaxWidth()]}>
      <SegmentedListItem index={0} count={2} enabled={false}>
        <SegmentedListItem.HeadlineContent>
          <Text color={colors.onSurface}>{props.message}</Text>
        </SegmentedListItem.HeadlineContent>
      </SegmentedListItem>
      <SegmentedListItem
        index={1}
        count={2}
        onClick={props.onRetry}
        colors={{ contentColor: colors.primary }}
        enabled={!props.retrying}>
        <SegmentedListItem.HeadlineContent>
          <Text>Retry</Text>
        </SegmentedListItem.HeadlineContent>
        {props.retrying ? (
          <SegmentedListItem.TrailingContent>
            <LoadingIndicator modifiers={[size(Spacing.four, Spacing.four)]} />
          </SegmentedListItem.TrailingContent>
        ) : null}
      </SegmentedListItem>
    </SegmentedList>
  );
};

export const ListState = ListStateProps.match({
  loading: () => <LoadingIndicator modifiers={[fillMaxWidth()]} />,
  empty: ({ message }) => <MessageState message={message} secondary />,
  message: ({ message }) => <MessageState message={message} />,
  error: (props) => <ErrorState {...props} />,
}) satisfies ListStateComponent;
