import { useAtom } from '@effect/atom-react';
import { Host, List, ProgressView, Section } from '@expo/ui/swift-ui';
import { containerRelativeFrame, frame, headerProminence } from '@expo/ui/swift-ui/modifiers';
import { AsyncResult } from 'effect/unstable/reactivity';
import { requireNativeView } from 'expo';
import { Stack, router } from 'expo-router';
import type { ComponentType } from 'react';
import { PlatformColor as platformColor } from 'react-native';

import { listUsersAtom } from '#src/app/accounts/server/users/index.ts';
import type { ServerUser } from '#src/app/accounts/server/users/index.ts';
import { Text } from '#src/components/text';

interface ServerUsersListProps {
  readonly users: readonly ServerUser[];
  readonly waiting: boolean;
  readonly done: boolean;
  readonly onEndReached: () => void;
  readonly onTap: (event: { readonly nativeEvent: { readonly id: string } }) => void;
}

const NativeServerUsersList: ComponentType<ServerUsersListProps> =
  requireNativeView('ServerUsersList');

const ServerUsersList = (props: ServerUsersListProps) => <NativeServerUsersList {...props} />;

export default function ServerUsersScreen() {
  const [users, loadMoreUsers] = useAtom(listUsersAtom);

  return (
    <>
      <Stack.Screen.Title>Manage Users</Stack.Screen.Title>
      <Host style={{ flex: 1, backgroundColor: platformColor('systemGroupedBackground') }}>
        {AsyncResult.matchWithError(users, {
          onInitial: () => (
            <ProgressView
              modifiers={[
                containerRelativeFrame({ axes: 'horizontal', alignment: 'center' }),
                frame({ maxWidth: Infinity, maxHeight: Infinity }),
              ]}
            />
          ),
          onSuccess: ({ value: { items, done }, waiting }) => (
            <List modifiers={[headerProminence('increased')]}>
              <Section title="Users">
                <ServerUsersList
                  users={items}
                  waiting={waiting}
                  done={done}
                  onTap={({ nativeEvent: { id } }) => {
                    router.push(`/accounts/server/users/${id}`);
                  }}
                  onEndReached={() => {
                    if (!waiting && !done) {
                      loadMoreUsers();
                    }
                  }}
                />
              </Section>
            </List>
          ),
          onError: () => <Text>Error</Text>,
          onDefect: () => <Text>Defect</Text>,
        })}
      </Host>
    </>
  );
}
