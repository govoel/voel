import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon, LazyColumn } from '@expo/ui/jetpack-compose';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { ListState } from '#src/components/list-state';
import { SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';

export const SessionList = (({ sessions, currentId, onSelect }) => {
  'use memo';

  const colors = useMaterialColors();

  return sessions.length === 0 ? (
    <ListState kind="empty" message="No active sessions." />
  ) : (
    <LazyColumn.Items data={sessions} keyExtractor={(session) => session.id}>
      {({ item, index }) => (
        <SegmentedListItem
          index={index}
          count={sessions.length}
          onClick={() => {
            onSelect(item);
          }}>
          <SegmentedListItem.HeadlineContent>
            <Text>{sessionDeviceName({ session: item, isCurrent: item.id === currentId })}</Text>
          </SegmentedListItem.HeadlineContent>
          <SegmentedListItem.TrailingContent>
            <Icon source={ChevronRight} size={24} tint={colors.onSurfaceVariant} />
          </SegmentedListItem.TrailingContent>
        </SegmentedListItem>
      )}
    </LazyColumn.Items>
  );
}) satisfies SessionListComponent;
