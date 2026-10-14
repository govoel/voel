import { Icon } from '@expo/ui';
import { Button, HStack, List, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { ListState } from '#src/components/list-state';
import { Text } from '#src/components/text';
import { sessionDeviceName } from '#src/domains/accounts/components/management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/domains/accounts/components/management/session-list';


export const SessionList = (({ sessions, currentId, onSelect }) => {
  'use memo';

  return sessions.length === 0 ? (
    <ListState kind="empty" message="No active sessions." />
  ) : (
    <List.ForEach data={sessions} keyExtractor={(session) => session.id}>
      {({ item }) => (
        <Button
          modifiers={[tint('primary')]}
          onPress={() => {
            onSelect(item);
          }}>
          <HStack>
            <Text>{sessionDeviceName({ session: item, isCurrent: item.id === currentId })}</Text>
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
      )}
    </List.ForEach>
  );
}) satisfies SessionListComponent;
