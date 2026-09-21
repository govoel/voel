import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon } from '@expo/ui/jetpack-compose';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { ListState } from '#src/components/list-state';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';

export const SessionList = (({ sessions, currentId, onSelect }) => {
  const colors = useMaterialColors();
  if (sessions.length === 0) {
    return <ListState kind="empty" message="No active sessions." />;
  }

  return (
    <SegmentedList>
      {sessions.map((session, index) => (
        <SegmentedListItem
          key={session.id}
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
      ))}
    </SegmentedList>
  );
}) satisfies SessionListComponent;
