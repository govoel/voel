import { Icon } from '@expo/ui';
import { Button, HStack, List, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { useCallback } from 'react';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';

export const SessionList = (({ sessions, currentId, onSelect }) => {
  const renderSession = useCallback(
    ({ item: session }: { item: (typeof sessions)[number] }) => (
      <Button
        modifiers={[tint('primary')]}
        onPress={() => {
          onSelect(session);
        }}>
        <HStack>
          <Text>{sessionDeviceName({ session, isCurrent: session.id === currentId })}</Text>
          <Spacer />
          <Icon
            name="chevron.right"
            modifiers={[
              font({ textStyle: 'footnote', weight: 'semibold' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          />
        </HStack>
      </Button>
    ),
    [currentId, onSelect]
  );

  return sessions.length === 0 ? (
    <ListState kind="empty" message="No active sessions." />
  ) : (
    <List.ForEach data={sessions} keyExtractor={(session) => session.id}>
      {renderSession}
    </List.ForEach>
  );
}) satisfies SessionListComponent;
