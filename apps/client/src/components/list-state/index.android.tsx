import { LoadingIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers';

import type { ListStateComponent } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';
import { Spacing } from '#src/constants/theme.ts';

export const ListState = ((props) => {
  const colors = useMaterialColors();

  if (props.kind === 'loading') {
    return <LoadingIndicator modifiers={[fillMaxWidth()]} />;
  }

  const count = props.kind === 'error' ? 2 : 1;

  return (
    <SegmentedList modifiers={[fillMaxWidth()]}>
      <SegmentedListItem key={props.kind} index={0} count={count} enabled={false}>
        <SegmentedListItem.HeadlineContent>
          <Text color={props.kind === 'empty' ? colors.onSurfaceVariant : colors.onSurface}>
            {props.message}
          </Text>
        </SegmentedListItem.HeadlineContent>
      </SegmentedListItem>
      {props.kind === 'error' ? (
        <SegmentedListItem
          index={1}
          count={count}
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
      ) : null}
    </SegmentedList>
  );
}) satisfies ListStateComponent;
