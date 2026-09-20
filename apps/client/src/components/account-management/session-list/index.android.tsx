import ChevronRight from '@expo/material-symbols/chevron_right.xml';
import { Icon } from '@expo/ui/jetpack-compose';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { SegmentedList, SegmentedListItem } from '#src/components/segmented-list/index.tsx';
import { Text } from '#src/components/text';
import { useMaterialColors } from '#src/constants/material.ts';

export const SessionList = (({ sessions, currentId, onSelect }) => {
  const colors = useMaterialColors();
  return (
    <SegmentedList>
      {sessions.length === 0 ? (
        <SegmentedListItem key="empty" index={0} count={1} enabled={false}>
          <SegmentedListItem.HeadlineContent>
            <Text color={colors.onSurfaceVariant}>No active sessions.</Text>
          </SegmentedListItem.HeadlineContent>
        </SegmentedListItem>
      ) : (
        sessions.map((session, index) => (
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
        ))
      )}
    </SegmentedList>
  );
}) satisfies SessionListComponent;
