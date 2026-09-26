import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';
import { useCallback } from 'react';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { ListState } from '#src/components/list-state';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';

export const SessionList = (({ sessions, currentId, onSelect }) => {
  const colors = useMaterialColors();
  const renderSession = useCallback(
    ({ item: session, index }: { item: (typeof sessions)[number]; index: number }) => (
      <SegmentedListItem
        index={index}
        count={sessions.length}
        onClick={() => {
          onSelect(session);
        }}>
        <SegmentedListItem.HeadlineContent>
          <Text>{sessionDeviceName({ session, isCurrent: session.id === currentId })}</Text>
        </SegmentedListItem.HeadlineContent>
        <SegmentedListItem.TrailingContent>
          <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
        </SegmentedListItem.TrailingContent>
      </SegmentedListItem>
    ),
    [colors.onSurfaceVariant, sessions.length, currentId, onSelect]
  );

  return sessions.length === 0 ? (
    <ListState kind="empty" message="No active sessions." />
  ) : (
    <LazyColumn.Items data={sessions} keyExtractor={(session) => session.id}>
      {renderSession}
    </LazyColumn.Items>
  );
}) satisfies SessionListComponent;
