import { Icon } from '@expo/ui';
import { Button, HStack, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, tint } from '@expo/ui/swift-ui/modifiers';

import { sessionDeviceName } from '#src/components/account-management/session-details/device-name.ts';
import type { SessionListComponent } from '#src/components/account-management/session-list';
import { Text } from '#src/components/text';

export const SessionList = (({ sessions, currentId, onSelect }) =>
  sessions.length === 0 ? (
    <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
      No active sessions.
    </Text>
  ) : (
    <>
      {sessions.map((session) => (
        <Button
          key={session.id}
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
      ))}
    </>
  )) satisfies SessionListComponent;
